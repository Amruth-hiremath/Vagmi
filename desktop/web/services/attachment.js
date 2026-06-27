import { apiRequest } from "./api.js";

async function parseJson(response) {
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data?.detail || "Request failed");
  }
  return data;
}

export async function uploadAttachment(roomId, file) {
  const formData = new FormData();
  formData.append("file", file);
  return parseJson(
    await apiRequest(`/rooms/${roomId}/attachments`, {
      method: "POST",
      body: formData
    })
  );
}
