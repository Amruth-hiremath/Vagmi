import { apiRequest } from "./api.js";

export async function getConversations() {
    return apiRequest("/dm");
}

export async function startConversation(
    username
) {
    return apiRequest(
        "/dm/start",
        {
            method: "POST",
            headers: {
                "Content-Type":
                    "application/json"
            },
            body: JSON.stringify({
                username
            })
        }
    );
}

export async function getMessages(
    conversationId
) {
    return apiRequest(
        `/dm/${conversationId}`
    );
}

export async function sendMessage(
    conversationId,
    messageText
) {
    return apiRequest(
        `/dm/${conversationId}`,
        {
            method: "POST",
            headers: {
                "Content-Type":
                    "application/json"
            },
            body: JSON.stringify({
                message_text:
                    messageText
            })
        }
    );
}

export async function sendImage(
    conversationId,
    file
) {
    const token =
        localStorage.getItem(
            "access_token"
        );

    const formData =
        new FormData();

    formData.append(
        "file",
        file
    );

    const response =
        await fetch(
            `http://127.0.0.1:8000/dm/${conversationId}/image`,
            {
                method: "POST",
                headers: {
                    Authorization:
                        `Bearer ${token}`
                },
                body: formData
            }
        );

    return response.json();
}