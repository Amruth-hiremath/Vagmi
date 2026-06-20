export async function uploadAttachment(
    roomId,
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
            `http://127.0.0.1:8000/rooms/${roomId}/attachments`,
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