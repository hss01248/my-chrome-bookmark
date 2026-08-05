chrome.action.onClicked.addListener(async () => {
  const url = chrome.runtime.getURL('bookmarks.html');
  await chrome.tabs.create({ url });
});
