import {
    isAuthenticated,
    clearSession
} from "./services/auth.js";

import {
    apiRequest
} from "./services/api.js";

const MIN_SPLASH_TIME = 1800;

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function determineNextPage() {

    if (!isAuthenticated()) {
        return "./pages/auth/index.html";
    }

    try {

        await apiRequest("/auth/me");

        return "./index.html";

    }
    catch {

        clearSession();

        return "./pages/auth/index.html";
    }
}

async function start() {

    const splashTimer = sleep(
        MIN_SPLASH_TIME
    );

    const nextPagePromise =
        determineNextPage();

    const [
        ,
        nextPage
    ] = await Promise.all([
        splashTimer,
        nextPagePromise
    ]);

    document.body.classList.add(
        "fade-out"
    );

    await sleep(
        350
    );

    window.location.replace(
        nextPage
    );
}

const status =
    document.getElementById(
        "status"
    );

setTimeout(
    () => status.innerText =
        "Loading user session...",
    1300
);

setTimeout(
    () => status.innerText =
        "Preparing environment...",
    2600
);

start();