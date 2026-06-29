// desktop/web/services/rooms.js
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

export async function updateRoom(roomId, data) {
  return parseJson(
    await apiRequest(`/rooms/${roomId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data)
    })
  );
}

export async function getRoom(roomId) {
  return parseJson(
    await apiRequest(`/rooms/${roomId}`)
  );
}

export async function getRoomMembers(roomId) {
  return parseJson(
    await apiRequest(`/rooms/${roomId}/members`)
  );
}

export async function addRoomMember(roomId, member) {
  const payload = {};
  if (typeof member === "number") {
    payload.user_id = member;
  } else if (typeof member === "string") {
    const trimmed = member.trim();
    if (/^\d+$/.test(trimmed)) {
      payload.user_id = Number(trimmed);
    } else {
      payload.username = trimmed;
    }
  } else if (member && typeof member === "object") {
    if (member.user_id !== undefined && member.user_id !== null) {
      payload.user_id = Number(member.user_id);
    }
    if (member.username) {
      payload.username = String(member.username);
    }
  }

  return parseJson(
    await apiRequest(
      `/rooms/${roomId}/members`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      }
    )
  );
}

export async function removeRoomMember(roomId, memberIdentifier) {
  const identifier = String(memberIdentifier);
  return parseJson(
    await apiRequest(
      `/rooms/${roomId}/members/${encodeURIComponent(identifier)}`,
      {
        method: "DELETE"
      }
    )
  );
}

export async function deleteRoom(roomId) {
  return parseJson(
    await apiRequest(
      `/rooms/${roomId}`,
      {
        method: "DELETE"
      }
    )
  );
}
export async function sendRoomImage(roomId, file) {
  const formData = new FormData();
  formData.append("file", file);

  return parseJson(
    await apiRequest(`/rooms/${roomId}/image`, {
      method: "POST",
      body: formData
    })
  );
}

export async function sendRoomVoice(roomId, file) {
  const formData = new FormData();
  formData.append("file", file);

  return parseJson(
    await apiRequest(`/rooms/${roomId}/voice`, {
      method: "POST",
      body: formData
    })
  );
}

export async function deleteRoomMessage(messageId) {
  return parseJson(
    await apiRequest(`/rooms/message/${messageId}`, {
      method: "DELETE"
    })
  );
}


export async function markRoomRead(roomId) {
  return parseJson(
    await apiRequest(`/rooms/${roomId}/read`, {
      method: "POST"
    })
  );
}

export async function deleteRoomMessageForMe(messageId) {
  const response = await apiRequest(
    `/rooms/messages/${messageId}/me`,
    {
      method: "DELETE"
    }
  );

  return response.json();
}