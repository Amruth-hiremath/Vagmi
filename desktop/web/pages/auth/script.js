import {
    login,
    getCurrentUser
}
from "../../services/auth.js";

const username =
    document.getElementById(
        "username"
    );

const password =
    document.getElementById(
        "password"
    );

const loginBtn =
    document.getElementById(
        "login-btn"
    );

const result =
    document.getElementById(
        "result"
    );

loginBtn.addEventListener(
    "click",
    async () => {

        try {

            await login(
                username.value,
                password.value
            );

            const me =
                await getCurrentUser();

            result.innerText =
                `Logged in as ${me.username}`;

            console.log(me);

        }
        catch(error) {

            result.innerText =
                error.message;
        }
    }
);