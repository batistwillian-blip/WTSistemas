import { describe, expect, it } from "vitest";
import { auraCan, auraPermsOf, parseAuraPerms } from "@/lib/aura/perms";

describe("auraPermsOf", () => {
  it("master pode tudo, mesmo sem nada marcado", () => {
    expect(auraPermsOf({ isAdmin: true, auraPerms: [] })).toEqual(["ver", "mover", "ensinar", "lead"]);
  });
  it("sem 'ver' nenhuma ação vale", () => {
    expect(auraPermsOf({ isAdmin: false, auraPerms: ["mover", "lead"] })).toEqual([]);
    expect(auraCan({ isAdmin: false, auraPerms: ["lead"] }, "lead")).toBe(false);
  });
  it("ignora valores desconhecidos e mantém a ordem", () => {
    expect(auraPermsOf({ isAdmin: false, auraPerms: ["lead", "ver", "hack"] })).toEqual(["ver", "lead"]);
    expect(auraPermsOf({ isAdmin: false, auraPerms: null })).toEqual([]);
  });
});

describe("parseAuraPerms", () => {
  it("marcar uma ação já inclui ver", () => {
    expect(parseAuraPerms(["ensinar"])).toEqual(["ver", "ensinar"]);
  });
  it("nada marcado = sem acesso", () => {
    expect(parseAuraPerms([])).toEqual([]);
    expect(parseAuraPerms(["<script>"])).toEqual([]);
  });
});
