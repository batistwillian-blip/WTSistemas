import { syncChServer } from "../src/lib/chserver-sync";

syncChServer()
  .then((r) => {
    console.log(r.message);
    process.exit(r.ok ? 0 : 1);
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
