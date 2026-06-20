const API_BASE_URL = "http://127.0.0.1:8000";

export async function apiRequest(
    endpoint,
    options = {}
) {
    const token =
        localStorage.getItem(
            "vagmi_token"
        );

    const headers = {
        ...(options.headers || {})
    };

    if (
        token &&
        !headers.Authorization
    ) {
        headers.Authorization =
            `Bearer ${token}`;
    }

    const response =
        await fetch(
            `${API_BASE_URL}${endpoint}`,
            {
                ...options,
                headers
            }
        );

    let data = null;

    try {
        data = await response.json();
    }
    catch {
        data = null;
    }

    if (!response.ok) {
        throw new Error(
            data?.detail ||
            "Request failed"
        );
    }

    return data;
}