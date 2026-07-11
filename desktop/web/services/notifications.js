import { getConversations } from "./dm.js";
import { getDesktopBridge } from "./desktop.js";

let timer = null;

let previousUnread = new Map();

const listeners = new Set();

export function subscribeUnread(listener) {
    listeners.add(listener);

    return () => listeners.delete(listener);
}

async function poll() {

    try {

        const bridge = getDesktopBridge();

        const conversations = await getConversations();

        let totalUnread = 0;

        for (const conversation of conversations) {

            const unread = Number(
                conversation.unread_count || 0
            );

            totalUnread += unread;

            const previous =
                previousUnread.get(
                    conversation.conversation_id
                ) || 0;

            if (
                unread > previous &&
                !document.hasFocus() &&
                bridge?.show_notification
            ) {

                await bridge.show_notification(
                    conversation.username,
                    conversation.last_message || "New message"
                );

            }

            previousUnread.set(
                conversation.conversation_id,
                unread
            );

        }

        listeners.forEach(listener =>
            listener(totalUnread)
        );

    } catch (err) {

        console.error(
            "Notification polling failed",
            err
        );

    }

}

export function startNotificationService() {

    if (timer) return;

    poll();

    timer = setInterval(
        poll,
        2000
    );

}

export function stopNotificationService() {

    if (!timer) return;

    clearInterval(timer);

    timer = null;

}