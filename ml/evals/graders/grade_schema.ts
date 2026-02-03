import * as fs from "fs";
import * as path from "path";
import Ajv from "ajv";
import addFormats from "ajv-formats";

const ajv = new Ajv({ allErrors: true, strict: true });
addFormats(ajv);

export function gradeSchema(params: { schema_path?: string; output_json: object | null }) {
  if (!params.schema_path) {
    return { ok: true, errors: [] };
  }
  const schemaFile = path.isAbsolute(params.schema_path)
    ? params.schema_path
    : path.join(process.cwd(), params.schema_path);
  const schema = JSON.parse(fs.readFileSync(schemaFile, "utf-8"));
  const validate = ajv.compile(schema);
  if (!params.output_json) {
    return { ok: false, errors: ["missing_output_json"] };
  }
  const ok = validate(params.output_json);
  const errors = validate.errors?.map((e) => `${e.instancePath} ${e.message}`) ?? [];
  return { ok: Boolean(ok), errors };
}
