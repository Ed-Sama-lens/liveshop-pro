/**
 * Room name helpers for Socket.IO shop-scoped rooms.
 * All room names follow the format `shop:{shopId}` to prevent cross-shop broadcast.
 */

const ROOM_PREFIX = 'shop:';

export function shopRoom(shopId: string): string {
  return `${ROOM_PREFIX}${shopId}`;
}

export function isValidRoom(roomName: string): boolean {
  return roomName.startsWith(ROOM_PREFIX) && roomName.length > ROOM_PREFIX.length;
}

export function getRoomShopId(roomName: string): string | null {
  if (!isValidRoom(roomName)) return null;
  return roomName.slice(ROOM_PREFIX.length);
}
