document.addEventListener("DOMContentLoaded", () => {

    const selectButton = document.getElementById("selectComponent");
    const status = document.getElementById("status");

    selectButton.addEventListener("click", async () => {

        try {

            const [tab] = await chrome.tabs.query({
                active: true,
                currentWindow: true
            });

            await chrome.tabs.sendMessage(tab.id, {
                action: "START_SELECTION"
            });

            status.textContent = "Selection mode enabled";

            window.close();

        } catch (error) {

            console.error(error);

            status.textContent = "Unable to start";

        }

    });

});