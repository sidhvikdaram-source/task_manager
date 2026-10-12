// Only run after inspecting the generated code. Uses synthetic fixtures, never app data.
import fs from "node:fs/promises";
import vm from "node:vm";
import { spawnSync } from "node:child_process";
const records = JSON.parse(await fs.readFile(process.argv[2], "utf8"));
const successful = (id) =>
  [...records]
    .reverse()
    .find((record) => record.id === id && record.http === 200);
const blocks = (answer, language) =>
  [...answer.matchAll(/```([^\n]*)\n([\s\S]*?)```/g)]
    .filter((match) => language.test(match[1]))
    .map((match) => match[2])
    .join("\n");
const results = [];
const javascript = successful("javascript-integer");
if (javascript) {
  const code = blocks(javascript.answer, /^(?:js|javascript)\s*$/i);
  if (
    !code ||
    /\b(?:require|import|process|fetch|eval|Function)\b|__proto__|constructor/.test(
      code,
    )
  )
    throw Error("Inspect unsupported JavaScript before evaluation");
  const cases = [
    ["0", 0],
    [" 007 ", 7],
    ["9007199254740991", 9007199254740991],
    ["9007199254740992", null],
    ["0000000000000000000000002", 2],
    ["", null],
    ["  ", null],
    ["12x", null],
    ["+1", null],
    ["-0", null],
    ["2.0", null],
    ["1e2", null],
    ["١٢", null],
    [true, null],
    [12, null],
    [null, null],
    [{}, null],
  ];
  const context = vm.createContext(
    {
      console: {
        assert(condition) {
          if (!condition) throw Error("Generated assertion failed");
        },
      },
      cases,
    },
    { codeGeneration: { strings: false, wasm: false } },
  );
  new vm.Script(
    code +
      "\nfor(const [input,expected] of cases){if(parseCount(input)!==expected)throw Error('Contract failed');}",
  ).runInContext(context, { timeout: 1500 });
  results.push({
    id: javascript.id,
    tests: cases.length,
    status: "passed",
    generatedAssertions: "passed",
  });
}
const python = successful("python-median");
if (python) {
  const code = blocks(python.answer, /^python\s*$/i);
  const wrapper = `import ast, json, sys\nsource=json.loads(sys.stdin.read())\ntree=ast.parse(source)\nfor node in ast.walk(tree):\n if isinstance(node,(ast.Import,ast.ImportFrom)):\n  names=[alias.name.split('.')[0] for alias in node.names] if isinstance(node,ast.Import) else [(node.module or '').split('.')[0]]\n  if any(name not in ('math','typing','statistics') for name in names): raise ValueError('Unsupported import')\n if isinstance(node,ast.Attribute) and node.attr.startswith('__'): raise ValueError('Unsupported attribute')\n if isinstance(node,ast.Name) and node.id in ('open','eval','exec','compile','globals','locals','getattr','setattr','__import__'): raise ValueError('Unsupported operation')\nscope={}\nexec(compile(tree,'synthetic-median','exec'),scope)\ncases=[([],None),([9],9),([1,3],2),([-7,-1,-3],-3),([4,1,3,2],2.5),([2,2,2],2),([0.25,0.75],0.5),([9,0,4,1,8],4)]\nfor values,expected in cases:\n original=values.copy()\n assert scope['median'](values)==expected\n assert values==original\nprint(json.dumps({'tests':len(cases),'status':'passed','generatedAssertions':'passed','mutation':'none'}))\n`;
  if (!code) throw Error("No copyable Python found");
  const execution = spawnSync(
    process.env.NIMBUS_EVAL_PYTHON || "python3",
    ["-I", "-S", "-c", wrapper],
    {
      input: JSON.stringify(code),
      encoding: "utf8",
      timeout: 2000,
      maxBuffer: 4000,
    },
  );
  if (execution.status !== 0)
    throw Error("Python contract failed: " + execution.stderr);
  results.push({ id: python.id, ...JSON.parse(execution.stdout) });
}
console.log(JSON.stringify(results, null, 2));
