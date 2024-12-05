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

async function debug_popup(obj) {
    await popup("Debug", JSON.stringify(obj, null, 4), "pre");
};

async function popup_error(error_message) {
    await popup("Error", error_message);
    throw new Error(error_message);
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
    let ids = await Promise.all([
        get_folder_id("1. raw_docs", ai_diot_folder_id),
        get_folder_id("2.1. templates", ai_diot_folder_id),
        get_folder_id("2.2. data_templates", ai_diot_folder_id),
        get_folder_id("3. results", ai_diot_folder_id),
    ]);
    return {
        raw_docs: ids[0],
        templates: ids[1],
        data_templates: ids[2],
        results: ids[3],
    };
};


class Document {
    constructor(name, modified_time, ids, folder_ids) {
        this.name = name;
        this.modified_time = modified_time;
        this.ids = ids;

        this.view = this.get_view();
        this.detailed_view = this.get_detailed_view();
    }

    get_view() {
        let view = document.createElement("div");
        view.classList.add("document");
        view.innerHTML = `
            <img src="doc_icon.png" alt="Document Icon">
            <div class="captions">
                <h2 class="title">${this.name}</h2>
                <p class="date">${this.modified_time}</p>
            </div>
            <button class="select">Select</button>
        `;
        return view;
    }

    get_detailed_view() {
        let view = document.createElement("div");
        view.id = "detailed";
        view.classList.add("document");
        view.innerHTML = `
            <img src="doc_icon.png" alt="Document Icon">
            <div id="action_block">
                <div class="captions">
                    <h2 class="title">${this.name}</h2>
                    <p class="date">${this.modified_time}</p>
                </div>
                <div class="buttons">
                    <button>
                        <a href="https://docs.google.com/document/d/${this.id}" target="_blank">Edit</a>
                    </button>
                    <button>Process</button>
                    <button>Process with data</button>
                    <button id="delete">Delete</button>
                </div>
            </div>
            <button class="select">Select</button>
        `;
        let buttons = view.getElementsByClassName("buttons")[0].getElementsByTagName("button");
        buttons[1].addEventListener("click", () => {alert("ToDo")});
        buttons[2].addEventListener("click", () => {alert("ToDo")});
        buttons[3].addEventListener("click", () => {alert("ToDo")});
        return view;
    }
};


class Documents {
    constructor() {
        this.detailed = null;
        this.node = document.getElementById("documents");
    }

    append_child(doc) {
        doc.view.addEventListener("click", () => {this.set_detailed(doc)});
        this.node.appendChild(doc.view);
    }

    set_detailed(doc) {
        if (this.detailed !== null) {
            this.node.replaceChild(this.detailed.view, this.detailed.detailed_view);
        }
        this.node.replaceChild(doc.detailed_view, doc.view);
        this.detailed = doc;
    }
};


async function list_documents(folder_ids) {
    let response = await gapi.client.drive.files.list({
        "q": `
            "me" in owners and
            trashed = false and
            (
                "${folder_ids.raw_docs}" in parents or
                "${folder_ids.templates}" in parents or
                "${folder_ids.data_templates}" in parents
            )
        `,
        "fields": "files(id, name, modifiedTime, parents)",
    });
    console.log(response);

    let files = new Map();
    response.result.files.forEach(async file => {
        if (file.parents.length != 1)
            await popup_error(`File "${file.name}" should have exactly 1 parent`);
        if (!files.has(file.name)) files.set(file.name, {ids: {}});

        if (file.parents[0] == folder_ids.raw_docs) {
            files.get(file.name).modified_time = file.modifiedTime;
            files.get(file.name).ids.raw_doc = file.id;
        } else if (file.parents[0] == folder_ids.templates) files.get(file.name).ids.template = file.id;
        else if (file.parents[0] == folder_ids.data_templates) files.get(file.name).ids.data_template = file.id;
    });
    console.log(files);

    let documents = new Documents();
    for (const file of files) {
        let file_name = file[0], file_obj = file[1];
        if (file_obj.raw_doc_id === undefined) await popup_error(`File "${file_name}" doesn't have raw_doc_id`);
        documents.append_child(new Document(file_obj.name, file_obj.modified_time, file_obj.ids, folder_ids));
    };
}


async function handle_upload_file(raw_docs_folder_id) {
    document.getElementById("upload").addEventListener("change", async () => {
        await popup("Uploading file...", "Please wait", "p", new Promise(async () => {
            const file = upload.files[0];
            console.log("Uploading file:", file.type, file.name);

            const form = new FormData();
            form.append("metadata", new Blob(
                [
                    JSON.stringify({
                        "parents": [raw_docs_folder_id],
                        "mimeType": file.type,
                        "name": file.name,
                        "fields": "id",
                    }),
                ],
                { type: "application/json" },
            ));
            form.append("file", file);

            let response = await fetch(
                "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart",
                {
                    method: "POST",
                    headers: new Headers({
                        "Authorization": "Bearer " + gapi.auth.getToken().access_token
                    }),
                    body: form,
                }
            );
            response = await response.json();
            console.log(response);

            location.reload();
        }));
    });
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

    await popup("Loading...", "Please wait", "p", new Promise(async (resolve, reject) => {
        await window.prepare_gapi();
        await Promise.all([
            load_user_info(),
            (async () => {
                const folder_ids = await basic_layout_in_google_drive();
                await Promise.all([
                    list_documents(folder_ids),
                    handle_upload_file(folder_ids.raw_docs),
                ]);
            })(),
        ]);
        resolve();
    }));
});
