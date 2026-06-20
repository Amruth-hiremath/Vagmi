import { apiRequest } from "./api.js";

async function parseJson(response) {
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data?.detail || "Request failed");
  }
  return data;
}

export async function getRooms() {
  return parseJson(await apiRequest("/rooms"));
}

export async function createRoom(name) {
  return parseJson(
    await apiRequest("/rooms", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name })
    })
  );
}

export async function getRoomMessages(roomId) {
  return parseJson(await apiRequest(`/rooms/${roomId}/messages`));
}

export async function sendRoomMessage(roomId, text) {
  return parseJson(
    await apiRequest(`/rooms/${roomId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message_text: text })
    })
  );
}
