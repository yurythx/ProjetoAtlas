import json

from channels.generic.websocket import AsyncWebsocketConsumer


class NotificationConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        self.user = self.scope.get("user")
        if not self.user or not self.user.is_authenticated:
            await self.close()
            return

        self.room_group_name = f"notifications_user_{self.user.id}"

        # Join room group
        await self.channel_layer.group_add(self.room_group_name, self.channel_name)

        await self.accept()

    async def disconnect(self, close_code):
        if hasattr(self, "room_group_name"):
            await self.channel_layer.group_discard(self.room_group_name, self.channel_name)

    async def notification_message(self, event):
        # Send message to WebSocket
        try:
            await self.send(text_data=json.dumps(event))
        except Exception as e:
            import logging
            logging.getLogger(__name__).error(f"Error sending WebSocket notification: {e}")
