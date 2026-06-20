import { apiRequest } from "./api.js";

export async function getRooms() {
    return apiRequest("/rooms");
}

export async function createRoom(
    name
) {
    return apiRequest(
        "/rooms",
        {
            method: "POST",
            headers: {
                "Content-Type":
                    "application/json"
            },
            body: JSON.stringify({
                name
            })
        }
    );
}

export async function getRoomMessages(
    roomId
) {
    return apiRequest(
        `/rooms/${roomId}/messages`
    );
}

export async function sendRoomMessage(
    roomId,
    text
) {
    return apiRequest(
        `/rooms/${roomId}/messages`,
        {
            method: "POST",
            headers: {
                "Content-Type":
                    "application/json"
            },
            body: JSON.stringify({
                message_text: text
            })
        }
    );
}