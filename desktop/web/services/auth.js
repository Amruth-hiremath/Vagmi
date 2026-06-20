import { apiRequest } from "./api.js";

export async function login(
    username,
    password
) {
    const result =
        await apiRequest(
            "/auth/login",
            {
                method: "POST",
                body: JSON.stringify({
                    username,
                    password
                })
            }
        );

    localStorage.setItem(
        "vagmi_token",
        result.access_token
    );

    return result;
}

export async function getCurrentUser() {
    return apiRequest("/auth/me");
}

export function logout() {
    localStorage.removeItem(
        "vagmi_token"
    );
}