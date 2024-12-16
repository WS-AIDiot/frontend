const THIS_PAGE_URL = new URL(window.location);
const API_ROOT = THIS_PAGE_URL.pathname.slice(0, THIS_PAGE_URL.pathname.indexOf("/editor")) + "/api";


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


/**
 * @param {String} tag
 * @param {String} id
 * @param {Array<String>} classList
 * @param {String} innerHTML
 * @param {HTMLElement[]} childList
 * @returns {HTMLElement}
 */
function createElement(tag, id = "", classList = [], innerHTML = "", childList = []) {
    // TODO: поменять по коду
    let element = document.createElement(tag);
    if (id) element.id = id;
    if (classList) element.classList.add(...classList);
    element.innerHTML = innerHTML;
    childList.forEach(child => element.appendChild(child));
    return element;
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

async function popup_debug(obj) {
    await popup("Debug", JSON.stringify(obj, null, 4), "pre");
};

async function popup_error(error_message) {
    await popup("Error", error_message);
    throw new Error(error_message);
};


/**
 * @param {String} title
 * @param {Array<{name: string, type: Type, comment: String | undefined}>} fields
 */
function popup_form(title, fields) {
    let innerHTML = "";
    for (const field of fields) {
        if (field.type === String) {
            innerHTML += `
                <div class="input_block">
                    <label for="${field.name}">${field.name}:</label>
                    <input type="text" id="${field.name}" name="${field.name}" required>
                </div>
                ${(field.comment === undefined) ? "" : `<p class="comment">${field.comment}</p>`}
            `;
        } else {
            popup_error(`Unsupported field type: ${field.type}`);
        };
    };
    let popup = createElement("div", "popup_container", [], `
        <div id="popup">
            <h1>${title}</h1>
            ${innerHTML}
            <button>Submit</button>
        </div>
    `);
    let button = popup.querySelector("button");

    document.body.style.overflow = "hidden";
    document.body.appendChild(popup);

    return new Promise((resolve, reject) => {
        popup.addEventListener("click", ev => {
            if (ev.target === button || ev.target === popup) {
                document.body.removeChild(popup);
                document.body.style.overflow = "auto";
                resolve(
                    (ev.target === button) ?
                        Array.from(popup.getElementsByTagName("input")).map(el => el.value) :
                        null
                );
            };
        });
    });
};


async function load_user_info() {
    let response;
    try {
        response = await gapi.client.drive.about.get({
            "fields": "user",
        });
    } catch (error) {
        error = error.result.error;
        if (error.code === 401 && error.status === "UNAUTHENTICATED") window.location.pathname = "/";
        else await popup_debug(error);
    };
    const user = response.result.user;
    console.log(user);
    document.getElementById("profile").innerHTML = `
        <h1>${user.displayName}</h1>
        <img src="${user.photoLink}" alt="Profile picture">
    `;
};


/**
 * @param {DocumentAndDataSourceSelector} selector
 */
function handle_tabs(selector) {
    let tabs = document.getElementsByClassName("tab");
    let editors = document.getElementsByClassName("editor");
    Array.from(tabs).forEach((tab, index) => {
        tab.addEventListener("click", () => {
            let active_editor = local_storage.get("active_editor", 0);
            tabs[active_editor].classList.remove("active");
            editors[active_editor].classList.remove("active");
            local_storage.set("active_editor", index);
            tabs[index].classList.add("active");
            editors[index].classList.add("active");
        });
    });
    local_storage.get_and_set("active_editor", 0, active_editor => (active_editor == 2) ? 0 : active_editor );
    tabs[local_storage.get("active_editor", 0)].click();

    tabs[2].addEventListener("click", async () => {
        if (selector.selected_data_source === null) {
            await popup("Error", "Please select a data_source");
            tabs[0].click();
            return;
        }
        if (selector.selected_document === null) {
            await popup("Error", "Please select a document");
            tabs[1].click();
            return;
        }

        const build_editor = document.getElementById("build_editor");
        build_editor.innerHTML = "";
        await popup("Loading...", "Please wait", "p", (async () => {
            const headers = {
                "accept": "application/json",
                "Authorization": `Bearer ${gapi.auth.getToken().access_token}`,
            };
            const [template_fields_names, data_source_data] = await Promise.all([
                (async () => {
                    let response = await fetch(`${API_ROOT}/v1/documents/${selector.selected_document}`, {
                        headers: headers,
                    });
                    return await response.json();
                })(),
                (async () => {
                    let response = await fetch(`${API_ROOT}/v1/data_source/${selector.selected_data_source}/data_sample`, {
                        headers: headers,
                    });
                    return await response.json();
                })(),
            ]);
            const build_data = new BuildData(template_fields_names, data_source_data);
            build_editor.appendChild(build_data.get_table());
        })());
    });
    document.getElementById("build").addEventListener("click", () => tabs[2].click());
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
    constructor(selector, name, modified_time, ids, folder_ids) {
        this.name = name;
        this.modified_time = modified_time;
        this.ids = ids;

        this.view = this.get_view(selector);
        this.detailed_view = this.get_detailed_view(selector, folder_ids);
    }

    /**
     * @param {DocumentAndDataSourceSelector} selector
     * @param {HTMLElement} view
     * @returns {HTMLElement}
     */
    add_select_listener(selector, view) {
        view.getElementsByClassName("select")[0].addEventListener("click", () => {
            selector.select_document(this);
        });
        return view;
    }

    async mock_copy(folder_id) {
        await popup("Warning!", "Not implemented yet<br>Just copying file", "p", (async () => {
            let response = await gapi.client.drive.files.copy({
                "fileId": this.ids.raw_doc,
                "parents": [folder_id],
                "name": this.name,
            });
            console.log(response);
            location.reload();
        })());
    }

    get_view(selector) {
        let view = createElement("div", "", ["document", "editor_item"], `
            <img src="doc_icon.png" alt="Document Icon">
            <div class="captions">
                <h2 class="title">${this.name}</h2>
                <p class="date">${this.modified_time}</p>
            </div>
            <button class="select">Select</button>
        `);
        this.add_select_listener(selector, view);
        return view;
    }

    get_detailed_view(selector, folder_ids) {
        let view = createElement("div", "detailed", ["document", "editor_item"], `
            <img src="doc_icon.png" alt="Document Icon">
            <div id="action_block">
                <div class="captions">
                    <h2 class="title">${this.name}</h2>
                    <p class="date">${this.modified_time}</p>
                </div>
                <div class="buttons">
                    <button>
                        <a href="https://docs.google.com/document/d/${this.ids.raw_doc}" target="_blank">Edit</a>
                    </button>
                </div>
            </div>
            <button class="select">Select</button>
        `);
        this.add_select_listener(selector, view);

        let buttons = view.getElementsByClassName("buttons")[0], button = document.createElement("button");
        if (this.ids.template === undefined) {
            button.innerHTML = "Process";
            button.addEventListener("click", async () => {
                if (selector.selected_data_source === null) {
                    await popup("Error", "Please select a data_source");
                    return;
                }
                await popup("Processing...", "Please wait", "p", (async () => {
                    let response = await fetch(`${API_ROOT}/v1/documents/${this.ids.raw_doc}/process`, {
                        "method": "POST",
                        "headers": {
                            "accept": "application/json",
                            "Authorization": `Bearer ${gapi.auth.getToken().access_token}`,
                            "Content-Type": "application/json",
                        },
                        "body": JSON.stringify({
                            "document_filename": this.name,
                            "parent_folder_id": folder_ids.templates,
                            "data_source_uid": selector.selected_data_source,
                        }),
                    });
                    if (response.status !== 200) {
                        response = await response.json();
                        await popup_debug(response);
                    }
                    location.reload();
                })());
            });
        } else {
            button.innerHTML = `
                <a href="https://docs.google.com/document/d/${this.ids.template}" target="_blank">Edit template</a>
            `;
        }
        buttons.appendChild(button);

        // TODO
        // button = document.createElement("button");
        // if (this.ids.data_template === undefined) {
        //     button.innerHTML = "Process with data";
        //     button.addEventListener("click", async () => {
        //         await this.mock_copy(folder_ids.data_templates);
        //     });
        // } else {
        //     button.innerHTML = `
        //         <a href="https://docs.google.com/document/d/${this.ids.template}" target="_blank">Edit data template</a>
        //     `;
        // }
        // buttons.appendChild(button);

        button = createElement("button", "", ["caution"], "Delete");
        button.addEventListener("click", () => {alert("ToDo")});
        buttons.appendChild(button);

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


async function list_documents(selector, folder_ids) {
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
        if (file_obj.ids.raw_doc === undefined) await popup_error(`File "${file_name}" doesn't have raw_doc_id`);
        documents.append_child(new Document(selector, file_name, file_obj.modified_time, file_obj.ids, folder_ids));
    };
}


function handle_upload_file(raw_docs_folder_id) {
    let upload = document.getElementById("upload_file");
    upload.addEventListener("change", async ev => {
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


function handle_add_data_source() {
    document.querySelector("#add_data_source").addEventListener("click", async () => {
        let data_source_info = await popup_form("Add Data Source", [
            { name: "Data Source Name", type: String },
            {
                name: "Connection String",
                type: String,
                comment: "PostgreSQL connection string format:<br>postgresql://[user[:password]@][netloc][:port][/dbname][?param1=value1&...]"
            },
            { name: "SQL Request", type: String },
        ]);
        if (data_source_info === null) return;

        let response = await fetch(`${API_ROOT}/v1/data_source`, {
            method: "POST",
            headers: {
                "accept": "application/json",
                "Content-Type": "application/json",
                "Authorization": `Bearer ${gapi.auth.getToken().access_token}`,
            },
            body: JSON.stringify({
                "name": data_source_info[0],
                "connection_string": data_source_info[1],
                "sql_request": data_source_info[2],
            }),
        });
        let response_json = await response.json();

        if (response.status === 200) location.reload()
        else {
            console.log(response, response_json);
            await popup_debug(response);
            await popup_debug(response_json);
        }
    });
};


class DocumentAndDataSourceSelector {
    constructor() {
        this.selected_document = null;
        this.selected_data_source = null;
        this.selected_document_footer_label = document
            .getElementById("footer_document")
            .getElementsByClassName("label")[0];
        this.selected_data_source_footer_label = document
            .getElementById("footer_data_source")
            .getElementsByClassName("label")[0];
    }

    /** @param {Document} document */
    select_document(document) {
        this.selected_document = document.ids.data_template || document.ids.template;  // TODO: failback
        this.selected_document_footer_label.innerHTML = document.name;
    }
    /** @param {Object} data_source */
    select_data_source(data_source) {
        this.selected_data_source = data_source.uid;
        this.selected_data_source_footer_label.innerHTML = data_source.name;
    }
};


/** @param {DocumentAndDataSourceSelector} selector */
async function load_data_sources(selector) {
    let response = await fetch(`${API_ROOT}/v1/data_source`, {
        headers: {
            "accept": "application/json",
            "Authorization": `Bearer ${gapi.auth.getToken().access_token}`,
        },
    });
    let response_json = await response.json();

    const data_sorces_element = document.querySelector("#data_sources");
    for (const data_sorce of response_json) {
        const data_sorce_element = createElement("div", "", ["data_source", "editor_item"], `
            <img src="db_icon.png" alt="Document Icon">
            <div class="captions">
                <h2 class="title">${data_sorce.name}</h2>
                <p class="date">${data_sorce.created_at}</p>
            </div>
            <button class="caution">Delete</button>
            <button class="select">Select</button>
        `);
        const buttons = data_sorce_element.getElementsByTagName("button");
        buttons[0].addEventListener("click", () => {
            confirm(`Are you sure you want to delete DataSorce "${data_sorce.name}"?`);
            alert("Just kidding. TODO");
        });
        buttons[1].addEventListener("click", () => {
            selector.select_data_source(data_sorce);
        });
        data_sorces_element.appendChild(data_sorce_element);
    };
};


class BuildData {
    /**
     * @param {String[]} template_fields_names
     * @param {Object} data_sorce_data
     */
    constructor(template_fields_names, data_sorce_data) {
        this.template_fields_names = template_fields_names;
        this.data_sorce_data = data_sorce_data;
    }

    /**
     * @returns {HTMLElement}
     */
    get_table() {
        return createElement("table", "", [], `
            <tr>
                <th>Template field name</th>
                <th>Value</th>
                <th>Data example</th>
            </tr>
        `, this.template_fields_names.map(
            template_field_name => this.#get_row(template_field_name)
        ));
    }

    /**
     * @param {String} template_field_name
     * @returns {HTMLElement}
     */
    #get_row(template_field_name) {
        const data_example_element = document.createElement("td");
        return createElement("tr", "", [], `<td>${template_field_name}</td>`, [
            createElement("td", "", [], "", [this.#get_select(data_example_element)]),
            data_example_element,
        ]);
    };

    /**
     * @param {HTMLElement} data_example_element
     * @returns {HTMLElement}
     */
    #get_select(data_example_element) {
        /** @type {HTMLSelectElement} */
        const select = createElement("select", "", [], `
            <optgroup label="DataSource columns names">
                ${
                    Object.keys(this.data_sorce_data).reduce(
                        (accumulator, currentKey) =>
                            accumulator + `<option value="data_source:${currentKey}">${currentKey}</option>`,
                    "")
                }
            </optgroup>
            <optgroup label="Macroses">
                <option value="macros:today">today</option>
            </optgroup>
            <optgroup label="Etc.">
                <option value="etc:literal">literal</option>
                <option value="etc:notset" selected disabled>notset</option>
            </optgroup>
        `);

        select.addEventListener("change", () => {
            if (select.value.startsWith("data_source"))
                data_example_element.innerHTML = this.data_sorce_data[select.value.slice(12)];
            else if (select.value === "macros:today") data_example_element.innerHTML = (new Date()).toLocaleDateString("ru-RU", {
                year: "numeric",
                month: "long",
                day: "numeric",
            });
            else if (select.value === "etc:literal") data_example_element.innerHTML = `<input type="text">`;
        });

        return select;
    };
}


window.addEventListener("load", async () => {
    await popup("Loading...", "Please wait", "p", (async () => {
        await window.prepare_gapi();
        await load_user_info();

        // sync part
        const selector = new DocumentAndDataSourceSelector();
        handle_tabs(selector);
        handle_add_data_source();

        // async part
        await Promise.all([
            (async () => {
                const folder_ids = await basic_layout_in_google_drive();
                handle_upload_file(folder_ids.raw_docs);
                await list_documents(selector, folder_ids);
            })(),
            load_data_sources(selector),
        ]);
    })());
});
