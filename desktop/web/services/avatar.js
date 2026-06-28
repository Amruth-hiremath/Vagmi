// desktop/web/services/avatar.js
// Shared avatar helpers used across the shell sidebar, chat, settings, etc.
// Keeps a single cache token so a profile-image upload can bust the cache app-wide.

import { apiRequest } from "./api.js";

const TOKEN_KEY = "vagmi-avatar-token";
let cacheToken = Number(localStorage.getItem(TOKEN_KEY) || 0);

// Cache of blob object URLs keyed by `${userId}:${token}` so re-renders don't
// re-fetch the same image. Old entries are revoked when superseded.
const urlCache = new Map();

export function initialsFor(name) {
  const parts = String(name || "U")
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase());
  return parts.join("") || "U";
}

/**
 * Resolve the authenticated URL used to fetch a user's profile image.
 * Returns a relative URL (the desktop proxy adds the Authorization header
 * only when going through apiRequest, so use apiRequest to actually load).
 */
export function profileImageUrl(userId) {
  return `/users/${userId}/profile-image?ts=${cacheToken}`;
}

export function myProfileImageUrl() {
  return `/users/me/profile-image?ts=${cacheToken}`;
}

/**
 * Load a user's profile image as a reusable object URL.
 * Returns "" when the user has no image (caller shows initials instead).
 */
export async function loadAvatarObjectUrl(userId) {
  if (!Number.isFinite(Number(userId))) return "";
  const key = `${userId}:${cacheToken}`;

  const cached = urlCache.get(key);
  if (cached) return cached;

  try {
    const response = await apiRequest(profileImageUrl(userId));
    if (!response.ok) return "";
    const blob = await response.blob();
    if (!blob || blob.size === 0) return "";
    const objectUrl = URL.createObjectURL(blob);

    // Revoke previous tokens for this user, keep the cache bounded.
    for (const [k] of urlCache) {
      if (k !== key && k.startsWith(`${userId}:`)) {
        const stale = urlCache.get(k);
        if (stale) URL.revokeObjectURL(stale);
        urlCache.delete(k);
      }
    }
    urlCache.set(key, objectUrl);
    return objectUrl;
  } catch {
    return "";
  }
}

/**
 * Load the currently logged-in user's profile image.
 */
export async function loadMyAvatarObjectUrl() {
  try {
    const response = await apiRequest(myProfileImageUrl());
    if (!response.ok) return "";
    const blob = await response.blob();
    if (!blob || blob.size === 0) return "";
    return URL.createObjectURL(blob);
  } catch {
    return "";
  }
}

/**
 * Call after any profile-image upload so every avatar consumer refreshes.
 */
export function bumpAvatarCache() {
  cacheToken += 1;
  try {
    localStorage.setItem(TOKEN_KEY, String(cacheToken));
  } catch {
    /* ignore storage errors */
  }

  // Revoke all cached URLs — they are now stale.
  for (const url of urlCache.values()) {
    try {
      URL.revokeObjectURL(url);
    } catch {
      /* ignore */
    }
  }
  urlCache.clear();

  window.dispatchEvent(new CustomEvent("vagmi-avatar-updated", { detail: { token: cacheToken } }));
}
