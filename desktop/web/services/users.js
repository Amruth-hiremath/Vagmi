import { apiRequest } from "./api.js";

export async function searchUsers(
    query
) {
    return apiRequest(
        `/users/search?query=${encodeURIComponent(query)}`
    );
}