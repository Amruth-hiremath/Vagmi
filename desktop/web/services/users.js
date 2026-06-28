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

export async function uploadMyProfileImage(file) {
  const formData = new FormData();
  formData.append("file", file);
  return parseJson(
    await apiRequest("/users/me/profile-image", {
      method: "POST",
      body: formData
    })
  );
}

export async function fetchMyProfileImageBlob() {
  const response = await apiRequest("/users/me/profile-image");
  return {
    blob: await response.blob(),
    contentType: response.headers.get("content-type") || "application/octet-stream"
  };
}
