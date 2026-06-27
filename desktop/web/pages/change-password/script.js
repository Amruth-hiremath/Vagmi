import { apiRequest } from "../../services/api.js";
import { getUser, saveUser } from "../../services/auth.js";

const form = document.getElementById(
  "change-password-form"
);

const currentPasswordInput =
  document.getElementById(
    "current-password"
  );

const newPasswordInput =
  document.getElementById(
    "new-password"
  );

const confirmPasswordInput =
  document.getElementById(
    "confirm-password"
  );

const message =
  document.getElementById(
    "message"
  );

form.addEventListener(
  "submit",
  async (event) => {
    event.preventDefault();

    message.textContent = "";
    message.className = "";

    const currentPassword =
      currentPasswordInput.value;

    const newPassword =
      newPasswordInput.value;

    const confirmPassword =
      confirmPasswordInput.value;

    if (
      newPassword !==
      confirmPassword
    ) {
      message.textContent =
        "Passwords do not match";

      message.classList.add(
        "error"
      );

      return;
    }

    try {

      await apiRequest(
        "/auth/change-password",
        {
          method: "POST",
          body: JSON.stringify({
            current_password:
              currentPassword,

            new_password:
              newPassword
          })
        }
      );

      const user =
        getUser();

      if (user) {

        user.must_change_password =
          false;

        saveUser(user);
      }

      message.textContent =
        "Password changed successfully";

      message.classList.add(
        "success"
      );

      setTimeout(() => {

        window.location.replace(
          "../../splash.html"
        );

      }, 1000);

    } catch (error) {

      message.textContent =
        error.message ||
        "Password change failed";

      message.classList.add(
        "error"
      );
    }
  }
);