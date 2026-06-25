import { getUser } from "../../services/auth.js";

import {
  getPendingUsers,
  getUsers,
  approveUser,
  rejectUser
} from "../../services/admin.js";

const pendingContainer =
  document.getElementById("pending-users");

const usersContainer =
  document.getElementById("all-users");

const currentUser = getUser();

if (!currentUser?.is_admin) {

  window.location.replace(
    "../../splash.html"
  );

}

function createPendingCard(user) {

  return `
  <div class="user-card">

    <div class="user-info">

      <div class="user-name">
        ${user.username}
      </div>

      <div class="user-meta">
        Awaiting approval
      </div>

    </div>

    <div class="user-actions">

      <button
        class="btn btn-approve"
        data-id="${user.id}"
        data-action="approve"
      >
        Approve
      </button>

      <button
        class="btn btn-reject"
        data-id="${user.id}"
        data-action="reject"
      >
        Reject
      </button>

    </div>

  </div>
  `;
}

function createUserCard(user) {

  return `
  <div class="user-card">

    <div class="user-info">

      <div class="user-name">
        ${user.username}
      </div>

      <div class="user-meta">

        <span class="badge ${
          user.is_admin
          ? "admin"
          : "user"
        }">

          ${
            user.is_admin
            ? "Administrator"
            : "User"
          }

        </span>

        <span class="badge ${
          user.is_approved
          ? "approved"
          : "pending"
        }">

          ${
            user.is_approved
            ? "Approved"
            : "Pending"
          }

        </span>

      </div>

    </div>

  </div>
  `;
}

async function loadData() {

  const pending =
    await getPendingUsers();

  const users =
    await getUsers();

  if (!pending.length) {

    pendingContainer.innerHTML =
      `
      <div class="empty">
      No pending requests.
      </div>
      `;

  } else {

    pendingContainer.innerHTML =
      pending
      .map(createPendingCard)
      .join("");

  }

  usersContainer.innerHTML =
    users
    .map(createUserCard)
    .join("");

}

document.addEventListener(
  "click",
  async (event) => {

    const button =
      event.target.closest("button");

    if (!button) return;

    const id =
      button.dataset.id;

    if (!id) return;

    if (
      button.dataset.action ===
      "approve"
    ) {

      await approveUser(id);

    }

    if (
      button.dataset.action ===
      "reject"
    ) {

      if (
        confirm(
          "Reject this registration?"
        )
      ) {

        await rejectUser(id);

      } else {

        return;

      }

    }

    await loadData();

  }
);
loadData();