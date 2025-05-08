// ==UserScript==
// @name         NI Azdo-PR Differ Tool
// @version      1.0
// @author       TestStand Team (NI)
// @description  Launches Differ Tool for NI Binary Files as of now supported for .seq and .vi files
// @license      MIT

// @include      https://dev.azure.com/*
// @include      https://*.visualstudio.com/*

// @run-at       document-end
// @require      https://cdnjs.cloudflare.com/ajax/libs/jquery/3.3.1/jquery.min.js
// @require      https://cdnjs.cloudflare.com/ajax/libs/jquery-once/2.2.3/jquery.once.min.js
// @require      https://cdnjs.cloudflare.com/ajax/libs/date-fns/1.30.1/date_fns.min.js
// @require      https://cdn.jsdelivr.net/npm/lodash@4.17.11/lodash.min.js
// @require      https://cdn.jsdelivr.net/npm/sweetalert2@9.13.1/dist/sweetalert2.all.min.js
// @require      https://gist.githubusercontent.com/alejandro5042/af2ee5b0ad92b271cd2c71615a05da2c/raw/45da85567e48c814610f1627148feb063b873905/easy-userscripts.js
// @require      https://unpkg.com/@popperjs/core@2.11.7
// @require      https://unpkg.com/tippy.js@6.3.7
// @require      https://cdn.jsdelivr.net/gh/highlightjs/cdn-release@11.8.0/build/highlight.min.js
// @require      https://cdnjs.cloudflare.com/ajax/libs/js-yaml/3.14.0/js-yaml.min.js
// @resource     linguistLanguagesYml https://raw.githubusercontent.com/github/linguist/master/lib/linguist/languages.yml?v=1
// @grant        GM_getResourceText
// @grant        GM_addStyle
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @grant        GM_addValueChangeListener
// @grant        GM_registerMenuCommand
// ==/UserScript==

(function () {
  'use strict';

  // All REST API calls should fail after a timeout, instead of going on forever.
  $.ajaxSetup({ timeout: 5000 });

  let currentUser;
  let azdoApiBaseUrl;

  // Some features only apply at National Instruments.
  const atNI = /^ni\./i.test(window.location.hostname) || /^\/ni\//i.test(window.location.pathname);

  function debug(...args) {
    // eslint-disable-next-line no-console
    console.log('[azdo-userscript]', args);
  }

  function error(...args) {
    // eslint-disable-next-line no-console
    console.error('[azdo-userscript]', args);
  }

  function main() {

    if (atNI) {
      eus.showTipOnce('release-29-09-2023', 'NI Azdo-PR Differ Tool', `
        <h2>Highlights from the 29-09-2023 update!</h2>
        <p>
          Supported for NI TestStand .seq files and LabVIEW .vi files as of now. For This feature to work the corresponding NI softwares should be installed on the local machine. As this feature will be launching TestStand FileDifferLauncher Tool for diifing TestStand files and LVCompare tool for diffing the LabVIEW files.
          <br> <b> Hope You have a better Diffing Experience &#128522;</b>
        </p>
        <hr>
        <p>Comments, bugs, suggestions? File an issue on <a href="https://github.com/sachin801/NI-Azdo-PR-FileDiffTool" target="_blank">GitHub</a> 🧡</p>
      `);
    }

    // Start modifying the page once the DOM is ready.
    if (document.readyState !== 'loading') {
      onReady();
    } else {
      document.addEventListener('DOMContentLoaded', onReady);
    }
  }

  function onReady() {
    // Find out who is our current user. In general, we should avoid using pageData because it doesn't always get updated when moving between page-to-page in AzDO's single-page application flow. Instead, rely on the AzDO REST APIs to get information from stuff you find on the page or the URL. Some things are OK to get from pageData; e.g. stuff like the user which is available on all pages.
    const pageData = JSON.parse(document.getElementById('dataProviders').innerHTML).data;
    currentUser = pageData['ms.vss-web.page-data'].user;
    debug('init', pageData, currentUser);

    const theme = pageData['ms.vss-web.theme-data'].requestedThemeId;
    const isDarkTheme = /(dark|night|neptune)/i.test(theme);

    // Because of CORS, we need to make sure we're querying the same hostname for our AzDO APIs.
    azdoApiBaseUrl = `${window.location.origin}${pageData['ms.vss-tfs-web.header-action-data'].suiteHomeUrl}`;
    console.log(azdoApiBaseUrl);
    eus.onUrl(/\/pullrequest\//gi, (session, urlMatch) => {
      if (atNI) {
        watchForLVDiffsAndAddNIBinaryDiffButton(session);
      }
    });
  }

  async function watchForLVDiffsAndAddNIBinaryDiffButton(session) {
    // NI Binary Diff is only supported on Windows
    if (navigator.userAgent.indexOf('Windows') === -1) return;

    addStyleOnce('ni-binary-git-diff', /* css */ `
      .ni-binary-git-diff-button {
        border-color: #03b585;
        border-radius: 2px;
        border-style: solid;
        border-width: 1px;
        color: #03b585;
      }
      .ni-binary-git-diff-dialog{
        border-color: #03b585;
        border-style: solid;
        border-width: 1px;
        display: none;
        padding: 10px;
      }`);

    const supportedFileExtensions = ['seq', 'vi'];
    const prUrl = await getCurrentPullRequestUrlAsync();
    const pr = await getCurrentPullRequestAsync();
    const iterations = (await $.get(`${prUrl}/iterations?api-version=5.0`)).value;

    session.onEveryNew(document, '.repos-change-summary-file-icon-container', repoChangeFileIcon => {
      const reposSummaryHeader = $(repoChangeFileIcon).closest('.repos-summary-header');
      const reposButtons = $(repoChangeFileIcon).closest('.flex-row,.flex-start')[0];
      var fileTabButtons = $(reposButtons).find('.justify-end')[0]
      const filePathElement = (reposSummaryHeader.length > 0 ? reposSummaryHeader : $('.repos-compare-toolbar')).find('.secondary-text.text-ellipsis')[0];
      if (!filePathElement) return;

      const filePath = filePathElement.innerText;
      if (!supportedFileExtensions.includes(getFileExt(filePath))) return;

      const launchDiffButton = $('<button class="bolt-button flex-grow-2 ni-binary-git-diff-button">Launch NI Azdo-PR Differ ▶</button>');
      const helpButton = $('<button class="bolt-button flex-grow-1 ni-binary-git-diff-button">?</button>');

      launchDiffButton.on('click', async (event) => {
        const currentUrl = new URL(window.location.href);

        let iterationIndex = currentUrl.searchParams.get('iteration');
        if (iterationIndex) {
          iterationIndex -= 1;
        } else {
          iterationIndex = iterations.length - 1;
        }
        const afterCommitId = iterations[iterationIndex].sourceRefCommit.commitId;

        let beforeCommitId = iterations[0].commonRefCommit.commitId;
        let baseIndex = currentUrl.searchParams.get('base');
        if (baseIndex) {
          baseIndex -= 1;
          if (baseIndex >= 0) {
            beforeCommitId = iterations[baseIndex].sourceRefCommit.commitId;
          }
        }

        console.log(filePath);
        let fileDirectories = filePath.split('/');
        console.log(fileDirectories);
        let fileName = fileDirectories[fileDirectories.length - 1];

        // Now lastElement contains the last part of the URL
        console.log(fileName);

        var original = 'Original_';
        var originalFileCustomName = original.concat(beforeCommitId, '_', fileName);
        console.log(originalFileCustomName);
        var modified = 'Modified_';

        var modifiedFileCustomName = modified.concat(afterCommitId, '_', fileName);
        var originalFileDownloadLink = `${azdoApiBaseUrl}/${pr.repository.project.name}/_apis/git/repositories/${pr.repository.id}/items/?path=${filePath}&versionDescriptor%5BversionOptions%5D=0&versionDescriptor%5BversionType%5D=2&versionDescriptor%5Bversion%5D=${beforeCommitId}&resolveLfs=true&%24format=octetStream&api-version=5.0`
        var modifiedFileDownloadLink = `${azdoApiBaseUrl}/${pr.repository.project.name}/_apis/git/repositories/${pr.repository.id}/items/?path=${filePath}&versionDescriptor%5BversionOptions%5D=0&versionDescriptor%5BversionType%5D=2&versionDescriptor%5Bversion%5D=${afterCommitId}&resolveLfs=true&%24format=octetStream&api-version=5.0`

        const orignalFileDownload = await downloadChangedFiles(originalFileDownloadLink, originalFileCustomName);
        const modifiedFileDownload = await downloadChangedFiles(modifiedFileDownloadLink, modifiedFileCustomName);
        await Promise.all([orignalFileDownload, modifiedFileDownload]);

        const protocolHandlerAddress = `NIAzdoPRDiffer:${originalFileCustomName},${modifiedFileCustomName}`;
        window.location = protocolHandlerAddress;
      });

      helpButton.on('click', (event) => {
        swal.fire({
          title: 'Feature Overview!',
          icon: 'info',
          text: 'Please ensure you have the required Differ Tool installed i.e., FileDifferLauncher for TestStand and LVCompare for LabVIEW files.',
          confirmButtonColor: '#03b585',
          confirmButtonText: 'Close',
        });
      });

      $(fileTabButtons).append(launchDiffButton);
      $(fileTabButtons).append(helpButton);
    });
  }

  // Helper function to download the modified files in the Pull Request.
  async function downloadChangedFiles(fileDownloadLink, downloadedFileName){
    fetch(fileDownloadLink)
      .then(response => response.blob())
      .then(blob => {
        var a = document.createElement('a');
        a.href = window.URL.createObjectURL(blob);
        a.download = downloadedFileName;
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      });
  }

  // Helper function to get the file extension out of a file path; e.g. `cs` from `blah.cs`.
  function getFileExt(path) {
    return /(?:\.([^.]+))?$/.exec(path)[1];
  }

  // Helper function to avoid adding CSS twice into a document.
  function addStyleOnce(id, style) {
    $(document.head).once(id).each(function () {
      $('<style type="text/css" />').html(style).appendTo(this);
    });
  }

  // Helper function to get the id of the PR that's on screen.
  function getCurrentPullRequestId() {
    return window.location.pathname.substring(window.location.pathname.lastIndexOf('/') + 1);
  }

  // Don't access this directly -- use getCurrentPullRequestAsync() instead.
  let currentPullRequest = null;

  async function getCurrentPullRequestAsync() {
    if (!currentPullRequest || currentPullRequest.pullRequestId !== getCurrentPullRequestId()) {
      currentPullRequest = await getPullRequestAsync();
    }
    return currentPullRequest;
  }

  // Helper function to get the url of the PR that's currently on screen.
  async function getCurrentPullRequestUrlAsync() {
    return (await getCurrentPullRequestAsync()).url;
  }

  // Async helper function get info on a single PR. Defaults to the PR that's currently on screen.
  function getPullRequestAsync(id = 0) {
    const actualId = id || getCurrentPullRequestId();
    return $.get(`${azdoApiBaseUrl}/_apis/git/pullrequests/${actualId}?api-version=5.0`);
  }

  main();
}());
