window.local_storage = {
    get: (key, default_value) => {
        let result = localStorage.getItem(key);
        result = (result === null) ? default_value : JSON.parse(result);
        return result;
    },
    set: (key, value) => {
        let str = JSON.stringify(value);
        localStorage.setItem(key, str);
        return str;
    }
};


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


window.addEventListener("load", () => {
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
        if (window.ENV === "static") {
            return mock_fetch(window.local_storage.get("documents", []));
        } else {
            alert("TODO");
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
});
