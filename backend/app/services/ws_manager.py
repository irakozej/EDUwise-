"""
WebSocket connection manager.
Tracks per-user connections so we can push real-time events to specific users.
"""
from __future__ import annotations

import asyncio
import json
from collections import defaultdict
from typing import Any

from fastapi import WebSocket


class ConnectionManager:
    def __init__(self) -> None:
        # user_id -> set of active WebSocket connections
        self._connections: dict[int, set[WebSocket]] = defaultdict(set)

    def connect(self, user_id: int, ws: WebSocket) -> None:
        self._connections[user_id].add(ws)

    def disconnect(self, user_id: int, ws: WebSocket) -> None:
        self._connections[user_id].discard(ws)
        if not self._connections[user_id]:
            del self._connections[user_id]

    async def send_to_user(self, user_id: int, payload: dict[str, Any]) -> None:
        """Push a JSON message to all connections for a user."""
        dead: list[WebSocket] = []
        for ws in list(self._connections.get(user_id, set())):
            try:
                await ws.send_text(json.dumps(payload))
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.disconnect(user_id, ws)

    async def broadcast_to_users(self, user_ids: list[int], payload: dict[str, Any]) -> None:
        await asyncio.gather(*[self.send_to_user(uid, payload) for uid in user_ids])

    def online_users(self) -> set[int]:
        return set(self._connections.keys())


# Singleton — imported everywhere
ws_manager = ConnectionManager()
