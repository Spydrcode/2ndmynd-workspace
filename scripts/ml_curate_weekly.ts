import { curateWeekly } from "../ml/curation/curate_weekly";

curateWeekly()
  .then((summary) => {
    console.log(JSON.stringify(summary, null, 2));
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
