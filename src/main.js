/*
Copyright 2020 Bruno Windels <bruno@windels.cloud>
Copyright 2020 The Matrix.org Foundation C.I.C.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

// import {RecordRequester, ReplayRequester} from "./matrix/net/request/replay.js";
import {createFetchRequest} from "./matrix/net/request/fetch.js";
import {xhrRequest} from "./matrix/net/request/xhr.js";
import {SessionContainer} from "./matrix/SessionContainer.js";
import {StorageFactory} from "./matrix/storage/idb/StorageFactory.js";
import {SessionInfoStorage} from "./matrix/sessioninfo/localstorage/SessionInfoStorage.js";
import {BrawlViewModel} from "./domain/BrawlViewModel.js";
import {BrawlView} from "./ui/web/BrawlView.js";
import {Clock} from "./ui/web/dom/Clock.js";
import {OnlineStatus} from "./ui/web/dom/OnlineStatus.js";

function addScript(src) {
    return new Promise(function (resolve, reject) {
        var s = document.createElement("script");
        s.setAttribute("src", src );
        s.onload=resolve;
        s.onerror=reject;
        document.body.appendChild(s);
    });
}

async function loadOlm(olmPaths) {
    // make crypto.getRandomValues available without
    // a prefix on IE11, needed by olm to work
    if (window.msCrypto && !window.crypto) {
        window.crypto = window.msCrypto;
    }
    if (olmPaths) {
        if (window.WebAssembly) {
            await addScript(olmPaths.wasmBundle);
            await window.Olm.init({locateFile: () => olmPaths.wasm});
        } else {
            await addScript(olmPaths.legacyBundle);
            await window.Olm.init();
        }
        return window.Olm;
    }
    return null;
}

// Don't use a default export here, as we use multiple entries during legacy build,
// which does not support default exports,
// see https://github.com/rollup/plugins/tree/master/packages/multi-entry
export async function main(container, olmPaths) {
    try {
        // to replay:
        // const fetchLog = await (await fetch("/fetchlogs/constrainterror.json")).json();
        // const replay = new ReplayRequester(fetchLog, {delay: false});
        // const request = replay.request;

        // to record:
        // const recorder = new RecordRequester(createFetchRequest(clock.createTimeout));
        // const request = recorder.request;
        // window.getBrawlFetchLog = () => recorder.log();
        const clock = new Clock();
        let request;
        if (typeof fetch === "function") {
            request = createFetchRequest(clock.createTimeout);
        } else {
            request = xhrRequest;
        }
        const sessionInfoStorage = new SessionInfoStorage("brawl_sessions_v1");
        const storageFactory = new StorageFactory();

        const vm = new BrawlViewModel({
            createSessionContainer: () => {
                return new SessionContainer({
                    random: Math.random,
                    onlineStatus: new OnlineStatus(),
                    storageFactory,
                    sessionInfoStorage,
                    request,
                    clock,
                    olmPromise: loadOlm(olmPaths),
                });
            },
            sessionInfoStorage,
            storageFactory,
            clock,
        });
        window.__brawlViewModel = vm;
        await vm.load();
        const view = new BrawlView(vm);
        container.appendChild(view.mount());
    } catch(err) {
        console.error(`${err.message}:\n${err.stack}`);
    }
}
