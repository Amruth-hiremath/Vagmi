import { apiRequest } from "./api.js";

async function parseJson(response) {
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data?.detail || "Request failed");
  }
  return data;
}

export async function searchUsers(query) {
  return parseJson(
    await apiRequest(`/users/search?query=${encodeURIComponent(query)}`)
  );
}
