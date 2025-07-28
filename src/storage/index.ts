import localForage from "localforage";

export default localForage.createInstance({
  driver: localForage.INDEXEDDB,
  name: "mind-sap",
});
