import { apiRequest } from "./api.js";
import { getUser, saveUser } from "./auth.js";

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

export async function approveUser(userId) {
  return parseJson(
    await apiRequest(
      `/admin/users/${userId}/approve`,
      {
        method: "POST"
      }
    )
  );
}

export async function rejectUser(userId) {
  return parseJson(
    await apiRequest(
      `/admin/users/${userId}`,
      {
        method: "DELETE"
      }
    )
  );
}

export async function makeAdmin(userId) {
  return parseJson(
    await apiRequest(
      `/admin/users/${userId}/make-admin`,
      {
        method: "POST"
      }
    )
  );
}

export async function removeAdmin(userId) {
  return parseJson(
    await apiRequest(
      `/admin/users/${userId}/remove-admin`,
      {
        method: "POST"
      }
    )
  );
}

export async function transferOwnership(userId) {
  const result = await parseJson(
    await apiRequest(
      `/admin/users/${userId}/transfer-ownership`,
      {
        method: "POST"
      }
    )
  );

  if (result.current_user) {
    const existingUser = getUser() || {};
    saveUser({
      ...existingUser,
      ...result.current_user
    });
  }

  return result;
}