import { apiRequest } from "./api.js";

async function parseJson(response) {
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data?.detail || "Request failed");
  }
  return data;
}

export async function uploadRoomAttachment(roomId, file) {
  const formData = new FormData();
  formData.append("file", file);
  return parseJson(
    await apiRequest(`/rooms/${roomId}/attachments`, {
      method: "POST",
      body: formData
    })
  );
}

export async function uploadDmAttachment(conversationId, file) {
  const formData = new FormData();
  formData.append("file", file);
  return parseJson(
    await apiRequest(`/dm/${conversationId}/attachment`, {
      method: "POST",
      body: formData
    })
  );
}

export const uploadAttachment = uploadRoomAttachment;
