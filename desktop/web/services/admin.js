import { apiRequest } from "./api.js";

async function parseJson(response) {
  const data = await response.json();

  if (!response.ok) {
    throw new Error(
      data?.detail ||
      "Request failed"
    );
  }

  return data;
}

export async function getPendingUsers() {
  return parseJson(
    await apiRequest(
      "/admin/pending-users"
    )
  );
}

export async function getUsers() {
  return parseJson(
    await apiRequest(
      "/admin/users"
    )
  );
}

export async function approveUser(
  userId
) {
  return parseJson(
    await apiRequest(
      `/admin/users/${userId}/approve`,
      {
        method: "POST"
      }
    )
  );
}

export async function rejectUser(
  userId
) {
  return parseJson(
    await apiRequest(
      `/admin/users/${userId}`,
      {
        method: "DELETE"
      }
    )
  );
}