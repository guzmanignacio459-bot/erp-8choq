import { readFileSync } from "node:fs";

import { authorizeCron8q } from "../lib/8q/meta-8q-cron.ts";
import { leerImporte } from "../lib/8q/pilar-escritura.ts";

const cron = authorizeCron8q({ authorization: null, mode: undefined, secret: "secreto-largo-de-prueba" });
const ruta = readFileSync(new URL("../app/api/8q/costos/route.ts", import.meta.url), "utf8");
const cronRuta = readFileSync(new URL("../app/api/8q/cron/meta/route.ts", import.meta.url), "utf8");
const sinInsert = !ruta.includes("INSERT") && !ruta.includes("prisma");
const rechaza = ruta.includes("tablas_no_creadas") && ruta.includes("401");
const cronProtegido = cronRuta.includes("authorizeCron8q");
console.log(`cron_apagado:${cron.ok === false && cron.status === 403} importe_vacio:${leerImporte("") === null} costos_sin_insert:${sinInsert} costos_rechaza:${rechaza} cron_usa_secreto:${cronProtegido}`);
if (cron.ok || leerImporte("") !== null || !sinInsert || !rechaza || !cronProtegido) process.exit(1);
