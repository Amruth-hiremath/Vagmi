import { getUser } from "../../services/auth.js";

import {
  getPendingUsers,
  getUsers,
  approveUser,
  rejectUser,
  makeAdmin,
  removeAdmin,
  transferOwnership
} from "../../services/admin.js";

const pendingContainer =
  document.getElementById("pending-users");

const usersContainer =
  document.getElementById("all-users");

let currentUser = getUser();

if (
    currentUser?.role !== "owner" &&
    currentUser?.role !== "admin" &&
    !currentUser?.is_admin
) {
    window.location.replace("../../splash.html");
}

else {
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
    let roleLabel = "";
    let roleClass = "";

    switch (user.role) {
      case "owner":
        roleLabel = " Owner";
        roleClass = "owner";
        break;

      case "admin":
        roleLabel = " Admin";
        roleClass = "admin";
        break;

      default:
        roleLabel = " User";
        roleClass = "user";
    }

    let actions = "";

    // Only the Owner can manage roles
    if (currentUser.role === "owner") {

      if (user.role === "user" && user.is_approved) {

        actions += `
          <button
            class="btn btn-approve"
            data-id="${user.id}"
            data-action="make-admin">
            Make Admin
          </button>
        `;

      }

      if (user.role === "admin") {

        actions += `
          <button
            class="btn btn-reject"
            data-id="${user.id}"
            data-action="remove-admin">
            Remove Admin
          </button>

        <button
          class="btn btn-approve"
          data-id="${user.id}"
          data-action="transfer-owner">
          Transfer Ownership
        </button>
        `;

      }

    }

    return `
      <div class="user-card">

        <div class="user-info">

          <div class="user-name">
            ${user.username}
          </div>

          <div class="user-meta">

          <span class="badge ${roleClass}">
            ${roleLabel}
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

      <div class="user-actions">
        ${actions}
      </div>

    </div>
    `;
  }

async function loadData() {

  try {
    console.log("Admin page loaded");

    console.log("Fetching pending users...");
    const pending = await getPendingUsers();
    console.log("Pending users:", pending);

    console.log("Fetching all users...");
    const users = await getUsers();
    console.log("Users:", users);

    if (!pendingContainer) {
      console.error("pending-users container not found");
      return;
    }

    if (!usersContainer) {
      console.error("all-users container not found");
      return;
    }

    if (!pending.length) {
      pendingContainer.innerHTML = `
        <div class="empty">
        No pending requests.
        </div>
        `;
    } else {
      pendingContainer.innerHTML = pending.map(createPendingCard).join("");
    }

    usersContainer.innerHTML = users.map(createUserCard).join("");

    console.log("Admin page rendered successfully.");

  } catch (err) {
    console.error("Admin page failed:", err);

    if (usersContainer) {
      usersContainer.innerHTML = `
        <div class="empty">
          ${err.message}
        </div>
      `;
    }
  }
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

      if (button.dataset.action === "make-admin") {
        await makeAdmin(id);
      }

      if (button.dataset.action === "remove-admin") {
        if (confirm("Remove admin privileges?")) {
          await removeAdmin(id);
        } else {
          return;
        }
      }

      if (button.dataset.action === "transfer-owner") {
          if (!confirm("Transfer ownership to this admin?")) {
              return;
          }

          await transferOwnership(id);

          alert(
              "Ownership transferred successfully.\n\nPlease log in again to continue with your updated permissions."
          );

          localStorage.removeItem("vagmi_token");
          localStorage.removeItem("vagmi_user");

          window.location.replace("../../pages/auth/index.html");
          return;
      }

      await loadData();

    }
  );
  loadData().catch(console.error);
}
