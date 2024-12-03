class MockResult {
    constructor(result) {
        this.result = result;
    };

    json() {
        return new Promise((resolve, reject) => {
            resolve(this.result);
        });
    }
}


function mock_fetch(result) {
    return new Promise((resolve, reject) => {
        resolve(new MockResult(result));
    });
}


async function popup(title, message = null, message_tag = "p", awaitable = null) {
    let popup = document.createElement("div");
    popup.id = "popup_container";
    popup.innerHTML = `
        <div id="popup">
            <h1>${title}</h1>
            ${(message === null) ? "" : `<${message_tag}>${message}</${message_tag}>`}
            ${(awaitable === null) ? "<button>Close</button>" : ""}
        </div>
    `;

    if (awaitable === null) {
        let button = popup.querySelector("button");
        awaitable = new Promise((resolve, reject) => {
            popup.addEventListener("click", (ev) => {
                if (ev.target == button || ev.target == popup) resolve();
            });
        });
    }

    document.body.style.overflow = "hidden";
    document.body.appendChild(popup);
    await awaitable;
    document.body.removeChild(popup);
    document.body.style.overflow = "auto";
};


async function load_user_info() {
    let response;
    try {
        response = await gapi.client.drive.about.get({
            "fields": "user",
        });
    } catch (error) {
        error = error.result.error;
        await popup("Error", JSON.stringify(error, null, 4), "pre");
        if (error.code === 401 && error.status === "UNAUTHENTICATED") window.location.pathname = "/";
    };
    const user = response.result.user;
    console.log(user);
    document.getElementById("profile").innerHTML = `
        <h1>${user.displayName}</h1>
        <img src="${user.photoLink}" alt="Profile picture">
    `;
};


const FOLDER_MIME_TYPE = "application/vnd.google-apps.folder";


async function get_folder_id(folder_name, parent_folder_id, force = true) {
    let response = await gapi.client.drive.files.list({
        "q": `
            "me" in owners and
            mimeType="${FOLDER_MIME_TYPE}" and
            trashed = false and
            "${parent_folder_id}" in parents and
            name = "${folder_name}"
        `,
        "fields": "files(id)",
    });
    console.log(response);

    if (response.result.files.length == 0) {
        if (force) {
            console.log(`Folder "${folder_name}" not found -> creating one...`);
            response = await gapi.client.drive.files.create({
                "mimeType": FOLDER_MIME_TYPE,
                "name": folder_name,
                "fields": "id",
                "parents": [parent_folder_id],
            });
            console.log(response);
            return response.result.id;
        }
        return null;
    }
    if (response.result.files.length > 1) {
        await popup("Error!", `More than one "${folder_name}" folder`);
    }

    return response.result.files[0].id;
};


async function basic_layout_in_google_drive() {
    const ai_diot_folder_id = await get_folder_id("ai-diot", "root");
    return Promise.all([
        get_folder_id("1. raw_docs", ai_diot_folder_id),
        get_folder_id("2.1. templates", ai_diot_folder_id),
        get_folder_id("2.2. data_templates", ai_diot_folder_id),
        get_folder_id("3. results", ai_diot_folder_id),
    ]);
};


window.addEventListener("load", async () => {
    let active_editor = 0;
    let tabs = document.getElementsByClassName("tab");
    let editors = document.getElementsByClassName("editor");
    for (let i = 0; i < tabs.length; i++) {
        const tab = tabs[i];
        tab.addEventListener("click", (ev) => {
            tabs[active_editor].classList.remove("active");
            editors[active_editor].classList.remove("active");
            active_editor = i;
            tabs[i].classList.add("active");
            editors[i].classList.add("active");
        });
    }

    let documents_element = document.getElementById("documents");
    (() => {
        if (window.ENV.ENV === "static") {
            return mock_fetch(window.local_storage.get("documents", []));
        } else {
            // alert("TODO");
        }
    })().then(response => {
        return response.json();
    }).then((json) => {
        for (const document of json) {
            console.log(document);
            documents_element.innerHTML += `
            <div class="document">
                <img src="doc_icon.png" alt="Document Icon">
                <div class="captions">
                    <h2 class="title">${document.filename}</h2>
                    <p class="date">${document.uploaded_at}</p>
                </div>
                <button class="select">Select</button>
            </div>`;
        }
    });

    let upload = document.getElementById("upload");
    upload.addEventListener("change", (ev) => {
        let filename = upload.value.split("\\")[2];
        let documents = window.local_storage.get("documents", []);
        documents.unshift({ "filename": filename, "uploaded_at": new Date() });
        window.local_storage.set("documents", documents);
        location.reload();
    });

    await popup("Loading...", "Please wait", "p", new Promise(async (resolve, reject) => {
        await window.prepare_gapi();
        await Promise.all([
            load_user_info(),
            (async () => {
                const ids = await basic_layout_in_google_drive();
                const raw_docs_folder_id = ids[0],
                    templates_folder_id = ids[1],
                    data_templates_folder_id = ids[2],
                    results_folder_id = ids[3];
            })(),
        ]);
        resolve();
    }));
});
