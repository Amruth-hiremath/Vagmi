import { apiRequest } from "./api.js";

export async function login(
    username,
    password
) {
    const data =
        await apiRequest(
            "/auth/login",
            {
                method: "POST",
                headers: {
                    "Content-Type":
                        "application/json"
                },
                body: JSON.stringify({
                    username,
                    password
                })
            }
        );

    localStorage.setItem(
        "vagmi_token",
        data.access_token
    );

    return data;
}

export async function register(
    username,
    password
) {
    return apiRequest(
        "/auth/register",
        {
            method: "POST",
            headers: {
                "Content-Type":
                    "application/json"
            },
            body: JSON.stringify({
                username,
                password
            })
        }
    );
}

export async function getCurrentUser() {
    return apiRequest("/auth/me");
}

export function logout() {
    localStorage.removeItem(
        "vagmi_token"
    );
}

export function getToken() {
    return localStorage.getItem(
        "vagmi_token"
    );
}