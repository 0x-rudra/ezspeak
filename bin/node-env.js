if (process.versions && process.versions.electron) {
  process.defaultApp = true;
  delete process.versions.electron;
}

