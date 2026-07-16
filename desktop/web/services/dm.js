import { apiRequest } from "./api.js";

async function parseJson(response) {
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data?.detail || "Request failed");
  }
  return data;
}

export async function getConversations() {
  return parseJson(await apiRequest("/dm"));
}

export async function startConversation(username) {
  return parseJson(
    await apiRequest("/dm/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username })
    })
  );
}

export async function getMessages(conversationId) {
  return parseJson(await apiRequest(`/dm/${conversationId}`));
}

export async function sendMessage(conversationId, messageText) {
  return parseJson(
    await apiRequest(`/dm/${conversationId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message_text: messageText })
    })
  );
}

export async function sendImage(conversationId, file, caption = null) {
  const formData = new FormData();
  formData.append("file", file);
  if (caption) {
    formData.append("caption", caption);
  }
  return parseJson(
    await apiRequest(`/dm/${conversationId}/image`, {
      method: "POST",
      body: formData
    })
  );
}


export async function sendAttachment(conversationId, file, caption = null) {
  const formData = new FormData();
  formData.append("file", file);
  if (caption) {
    formData.append("caption", caption);
  }
  return parseJson(
    await apiRequest(`/dm/${conversationId}/attachment`, {
      method: "POST",
      body: formData
    })
  );
}

export async function sendVoice(conversationId, file) {
  const formData = new FormData();

  formData.append(
    "file",
    file
  );

  return parseJson(
    await apiRequest(
      `/dm/${conversationId}/voice`,
      {
        method: "POST",
        body: formData
      }
    )
  );
}

export async function markConversationRead(conversationId) {
  return parseJson(
    await apiRequest(`/dm/${conversationId}/mark-read`, {
      method: "POST"
    })
  );
}
export async function clearConversation(conversationId) {
  const response = await apiRequest(
    `/dm/${conversationId}/clear`,
    {
      method: "POST"
    }
  );

  return response.json();
}

export async function deleteMessage(
  messageId
) {
  return parseJson(
    await apiRequest(
      `/dm/message/${messageId}`,
      {
        method: "DELETE"
      }
    )
  );
}

export async function deleteMessageForMe(messageId) {
  const response = await apiRequest(
    `/dm/message/${messageId}/me`,
    {
      method: "DELETE"
    }
  );

  return response.json();
}