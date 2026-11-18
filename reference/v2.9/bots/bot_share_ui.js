import { world, system, StructureSaveMode } from '@minecraft/server';
import { ActionFormData, ModalFormData } from '@minecraft/server-ui';
import {
	listBots,
	collectBuild,
	writeBuildToEntity,
	readBuildFromEntity,
	commitBuild,
	clearCarrier,
	MARKER_TAG,
	CARRIER_NAME,
} from './bot_share';
const CHAMBER_PREFIX = 'botshare_',
	STRUCTURE_NAMESPACE = 'mystructure:',
	SCRATCH_ID = 'botshare:scratch_restore',
	CHAMBER_PROP = 'botshare_chamber',
	INNER = 3,
	CHAMBER = INNER + 2,
	SEARCH_RADIUS = 6,
	SHELL_BLOCK = 'minecraft:glass',
	FLOOR_BLOCK = 'minecraft:smooth_stone',
	SCAN_RADIUS = 48,
	PLACE_SETTLE_TICKS = 10,
	floorVec = (c) => ({
		x: Math.floor(c.x),
		y: Math.floor(c.y),
		z: Math.floor(c.z),
	}),
	addVec = (c, d) => ({
		x: c.x + d.x,
		y: c.y + d.y,
		z: c.z + d.z,
	}),
	showVec = (c) => c.x + ', ' + c.y + ', ' + c.z;
function structureIdFor(c) {
	return '' + STRUCTURE_NAMESPACE + CHAMBER_PREFIX + c.replace(/[^\w]/g, '_');
}
function setBlockSafe(c, d, f) {
	try {
		c.getBlock(d)?.setType(f);
	} catch (g) {}
}
function chamberCorner(c) {
	return addVec(c, {
		x: -1,
		y: -1,
		z: -1,
	});
}
function chamberBounds(c) {
	const d = chamberCorner(c);
	return {
		from: d,
		to: addVec(d, {
			x: CHAMBER - 1,
			y: CHAMBER - 1,
			z: CHAMBER - 1,
		}),
	};
}
function interiorCenter(c) {
	const d = Math.floor((INNER - 1) / 2);
	return addVec(c, {
		x: d,
		y: 0,
		z: d,
	});
}
function forEachShell(c, d) {
	for (let e = -1; e <= INNER; e++) {
		for (let f = -1; f <= INNER; f++) {
			for (let g = -1; g <= INNER; g++) {
				const h = e === -1 || f === -1 || g === -1 || e === INNER || f === INNER || g === INNER;
				if (h)
					d(
						addVec(c, {
							x: e,
							y: f,
							z: g,
						}),
						f === -1,
					);
			}
		}
	}
}
function forEachInterior(c, d) {
	for (let e = 0; e < INNER; e++)
		for (let f = 0; f < INNER; f++)
			for (let g = 0; g < INNER; g++)
				d(
					addVec(c, {
						x: e,
						y: f,
						z: g,
					}),
				);
}
function findCarrierNear(c, d, e = SCAN_RADIUS) {
	const f = c.getEntities({
		location: d,
		maxDistance: e,
		tags: [MARKER_TAG],
	});
	return f.find((g) => g.isValid) ?? null;
}
export function ShareMenu(c, d) {
	const e = new ActionFormData();
	(e.title('§l§bShare Bots'),
		e.body(
			'§8Bot builds travel as a §fstructure file§8 containing a §dData Pig§8 that carries the build.',
		),
		e.button('§aExport a Bot\n§8Build an export chamber', 'textures/ui/copy'),
		e.button('§bImport a Bot\n§8Read a shared structure', 'textures/ui/download_backup'),
		e.button('§6Clean Up\n§8Remove an export chamber', 'textures/ui/trash'),
		e.button('§8Back', 'textures/ui/arrow_left'),
		e
			.show(c)
			.then((f) => {
				if (f.canceled || f.selection === 3) return d?.(c);
				if (f.selection === 0) return ExportSelector(c, d);
				if (f.selection === 1) return ImportMenu(c, d);
				return CleanupChamber(c, d);
			})
			.catch((f) => console.warn('Form error: ', f)));
}
function ExportSelector(c, d) {
	const e = listBots(),
		f = Object.keys(e),
		g = new ActionFormData();
	(g.title('§l§aExport Bot'),
		g.body(f.length ? '§8Pick a build to export:' : "§cYou haven't made any bots yet."),
		f.forEach((h) =>
			g.button(
				'§b' + h + '\n§8' + (e[h].actions || []).length + ' actions',
				'textures/items/paper',
			),
		),
		g.button('§8Back', 'textures/ui/arrow_left'),
		g
			.show(c)
			.then((h) => {
				if (h.canceled || h.selection === f.length) return ShareMenu(c, d);
				ConfirmExport(c, f[h.selection], d);
			})
			.catch((h) => console.warn('Form error: ', h)));
}
function ConfirmExport(c, d, e) {
	const f = chamberBaseFor(c),
		g = new ActionFormData();
	(g.title('§l§aBuild Export Chamber'),
		g.body(
			'§8A sealed §f' +
				CHAMBER +
				'x' +
				CHAMBER +
				'x' +
				CHAMBER +
				'§8 chamber will be built at §f' +
				showVec(chamberCorner(f)) +
				'§8, ' +
				'§creplacing any blocks there§8.',
		),
		g.button('§aBuild it here', 'textures/ui/confirm'),
		g.button('§8Cancel', 'textures/ui/cancel'),
		g
			.show(c)
			.then((h) => {
				if (h.canceled || h.selection === 1) return ShareMenu(c, e);
				system.run(() => BuildExportChamber(c, d, f, e));
			})
			.catch((h) => console.warn('Form error: ', h)));
}
function chamberBaseFor(c) {
	const d = c.getViewDirection(),
		e = {
			x: d.x,
			y: 0,
			z: d.z,
		},
		f = Math.hypot(e.x, e.z) || 1,
		g = Math.floor((INNER - 1) / 2);
	return floorVec({
		x: c.location.x + (e.x / f) * 3.5 - g,
		y: c.location.y,
		z: c.location.z + (e.z / f) * 3.5 - g,
	});
}
function BuildExportChamber(c, d, f, g) {
	const h = c.dimension;
	let i;
	try {
		i = collectBuild(d);
	} catch (r) {
		return (c.sendMessage('§cExport failed: §f' + r.message), ShareMenu(c, g));
	}
	(RemoveChamber(),
		forEachShell(f, (s, t) => setBlockSafe(h, s, t ? FLOOR_BLOCK : SHELL_BLOCK)),
		forEachInterior(f, (s) => setBlockSafe(h, s, 'minecraft:air')));
	const j = chamberCorner(f);
	setBlockSafe(h, j, 'minecraft:structure_block');
	const k = interiorCenter(f),
		l = h.spawnEntity('minecraft:pig', {
			x: k.x + 0.5,
			y: k.y,
			z: k.z + 0.5,
		});
	((l.nameTag = CARRIER_NAME), l.addTag(MARKER_TAG));
	try {
		(l.runCommand('effect @s resistance 999999 255 true'),
			l.runCommand('effect @s slowness 999999 255 true'));
	} catch (s) {}
	let m;
	try {
		m = writeBuildToEntity(l, i);
	} catch (t) {
		return (l.remove(), c.sendMessage('§cExport failed: §f' + t.message), ShareMenu(c, g));
	}
	const n = structureIdFor(d),
		{ from: o, to: p } = chamberBounds(f);
	let q = false;
	try {
		if (world.structureManager.get(n)) world.structureManager.delete(n);
		world.structureManager.createFromWorld(n, h, o, p, {
			saveMode: StructureSaveMode.World,
			includeEntities: false,
			includeBlocks: false,
		});
	} catch (u) {
		((q = true), console.warn('structure pre-save failed: ', u));
	}
	(world.setDynamicProperty(
		CHAMBER_PROP,
		JSON.stringify({
			base: f,
			dimension: h.id,
			botId: d,
			structureId: n,
		}),
	),
		i.notes.forEach((v) => c.sendMessage('§e⚠ ' + v)),
		ExportInstructions(c, d, n, f, m, q, g));
}
function ExportInstructions(c, d, e, f, g, h, i) {
	const j = e.slice(STRUCTURE_NAMESPACE.length),
		k = new ActionFormData();
	(k.title('§l§aExport Ready'),
		k.body(
			'§aData Pig loaded with §e' +
				d +
				'§a.\n' +
				('§8' +
					g.chars +
					' characters in ' +
					g.chunks +
					' propert' +
					(g.chunks === 1 ? 'y' : 'ies') +
					'.\n\n') +
				('§l§eStructure name:\n§r§f' + j + '\n\n') +
				(h
					? '§8The structure is §aalready saved§8 under that name.\n\n'
					: "§8Auto-save failed — you'll need to Save manually.\n\n") +
				'§l§e--- How to get the file ---\n§r' +
				("§f1. §8Tap the structure block in the chamber's bottom corner §f(" +
					showVec(chamberCorner(f)) +
					')§8.\n') +
				'§f2. §8Type the structure name above into the §fStructure Name§8 field.\n' +
				('§f3. §8If you need to re-save: leave §fSize §8at the default §f' +
					CHAMBER +
					' ' +
					CHAMBER +
					' ' +
					CHAMBER +
					'§8, set offset §f0 0 0§8, ') +
				'turn §fInclude Entities §aON§8, then press §fSave§8.\n' +
				'§f4. §8Press §fExport§8 and choose where to put the §f.mcstructure§8 file.\n' +
				'§f5. §8Send that file to whoever wants the build.\n\n' +
				'§c⚠ The Export button only exists on Windows. On other platforms you can still share it by copying the file out of your world folder, or by having the other player import from your world.',
		),
		k.button('§8Done', 'textures/ui/confirm'),
		k
			.show(c)
			.then(() => ShareMenu(c, i))
			.catch((l) => console.warn('Form error: ', l)));
}
function ImportMenu(c, d) {
	const e = new ActionFormData();
	(e.title('§l§bImport Bot'),
		e.body(
			"§8Two ways in:\n\n§f• Load by name §8— the addon places the structure, reads the pig, and puts your blocks back.\n§f• Scan nearby §8— if you already loaded the structure yourself, just read the pig that's standing there.",
		),
		e.button('§bLoad by structure name', 'textures/ui/magnifyingGlass'),
		e.button('§aScan for a nearby Data Pig', 'textures/items/pig_spawn_egg'),
		e.button('§8Help — where do I put the file?', 'textures/ui/infobulb'),
		e.button('§8Back', 'textures/ui/arrow_left'),
		e
			.show(c)
			.then((f) => {
				if (f.canceled || f.selection === 3) return ShareMenu(c, d);
				if (f.selection === 0) return ImportByName(c, d);
				if (f.selection === 1) return ImportByScan(c, d);
				return ImportHelp(c, d);
			})
			.catch((f) => console.warn('Form error: ', f)));
}
function ImportHelp(c, d) {
	const e = new ActionFormData();
	(e.title('§l§bImporting a Structure File'),
		e.body(
			"§8Bedrock has no in-game import button, so the §f.mcstructure§8 file has to be put in place first:\n\n§f1. §8Put the file in the behaviour pack's §fstructures§8 folder, or in your world's §fstructures§8 folder.\n§f2. §8The file name becomes the structure name — §fmy_bot.mcstructure§8 loads as §fmy_bot§8.\n§f3. §8Come back here and use §fLoad by structure name§8.\n\n§8Alternatively: place a structure block, type the name, press §fLoad§8 to spawn the pig yourself, then use §fScan for a nearby Data Pig§8.",
		),
		e.button('§8Back', 'textures/ui/arrow_left'),
		e
			.show(c)
			.then(() => ImportMenu(c, d))
			.catch((f) => console.warn('Form error: ', f)));
}
function ImportByName(c, d) {
	const e = new ModalFormData();
	(e.title('§l§bLoad Structure'),
		e.textField(
			'§bStructure name\n§8As it appears in the structure block:',
			'e.g. botshare_UHC_Bot',
		),
		e
			.show(c)
			.then((f) => {
				if (f.canceled) return ImportMenu(c, d);
				const g = String(f.formValues[0] ?? '').trim();
				if (!g) return (c.sendMessage('§cEnter a structure name.'), ImportByName(c, d));
				const h = g.includes(':') ? [g] : ['' + STRUCTURE_NAMESPACE + g, 'botshare:' + g, g],
					i = h.find((j) => {
						try {
							return world.structureManager.get(j) !== undefined;
						} catch (k) {
							return true;
						}
					});
				if (!i)
					return (
						c.sendMessage("§cNo structure called '§f" + g + "§c' is loaded in this world."),
						c.sendMessage(
							"§8Check the file is in a behaviour pack's structures folder, then rejoin the world.",
						),
						ImportMenu(c, d)
					);
				system.run(() => PlaceAndRead(c, i, d));
			})
			.catch((f) => console.warn('Form error: ', f)));
}
function PlaceAndRead(c, d, f) {
	const g = c.dimension,
		h = g.heightRange,
		i = floorVec({
			x: c.location.x,
			y: Math.min(Math.max(c.location.y + 25, h.min + 2), h.max - (CHAMBER + 2)),
			z: c.location.z,
		}),
		{ from: j, to: k } = chamberBounds(i);
	let l = true;
	const m = () => {
		if (l) return;
		l = false;
		try {
			(world.structureManager.place(SCRATCH_ID, g, j, {
				includeEntities: true,
			}),
				world.structureManager.delete(SCRATCH_ID));
		} catch (n) {
			console.warn('scratch restore failed: ', n);
		}
	};
	try {
		if (world.structureManager.get(SCRATCH_ID)) world.structureManager.delete(SCRATCH_ID);
		(world.structureManager.createFromWorld(SCRATCH_ID, g, j, k, {
			saveMode: StructureSaveMode.Memory,
			includeEntities: true,
			includeBlocks: false,
		}),
			world.structureManager.place(d, g, j, {
				includeEntities: false,
			}));
	} catch (n) {
		return (m(), c.sendMessage("§cCouldn't place that structure: §f" + n), ImportMenu(c, f));
	}
	system.runTimeout(() => {
		const o = Math.floor((CHAMBER - 1) / 2),
			p = addVec(j, {
				x: o,
				y: o,
				z: o,
			}),
			q =
				findCarrierNear(g, p, SEARCH_RADIUS) ??
				g.getEntities({
					location: p,
					maxDistance: SEARCH_RADIUS,
					name: CARRIER_NAME,
				})[0];
		let r = null,
			s = null;
		if (!q) s = 'No Data Pig was found inside that structure.';
		else {
			try {
				r = readBuildFromEntity(q);
			} catch (t) {
				s = t.message;
			}
			try {
				q.remove();
			} catch (u) {}
		}
		m();
		if (s) return (c.sendMessage('§cImport failed: §f' + s), ImportMenu(c, f));
		ImportPreview(c, r, f);
	}, PLACE_SETTLE_TICKS);
}
function ImportByScan(c, d) {
	const f =
		findCarrierNear(c.dimension, c.location) ??
		c.dimension.getEntities({
			location: c.location,
			maxDistance: SCAN_RADIUS,
			name: CARRIER_NAME,
		})[0];
	if (!f)
		return (
			c.sendMessage(
				'§cNo Data Pig within ' +
					SCAN_RADIUS +
					' blocks. Load the structure first, then stand near it.',
			),
			ImportMenu(c, d)
		);
	let g;
	try {
		g = readBuildFromEntity(f);
	} catch (h) {
		return (c.sendMessage("§cThat pig's data is unreadable: §f" + h.message), ImportMenu(c, d));
	}
	ImportPreview(c, g, d, f);
}
function ImportPreview(c, d, e, f) {
	const g = d.id in listBots();
	let h =
		'§bName: §f' +
		d.id +
		'\n§bKit: §f' +
		(d.kit ?? 'None') +
		'\n§bActions: §f' +
		d.actions.length +
		'\n\n';
	h += d.actions
		.slice(0, 12)
		.map(
			(j) =>
				'§8- §f' +
				j.action +
				' §8(' +
				(j.type === 'variable' ? j.conditions.length + ' cond' : 'always') +
				', order ' +
				j.order +
				')',
		)
		.join('\n');
	if (d.actions.length > 12) h += '\n§8...and ' + (d.actions.length - 12) + ' more';
	if (Object.keys(d.bundledKits).length)
		h += '\n\n§dIncludes kit: §f' + Object.keys(d.bundledKits).join(', ');
	if (d.warnings.length) h += '\n\n§e⚠ ' + d.warnings.join('\n§e⚠ ');
	if (g) h += "\n\n§cYou already have a bot called '" + d.id + "'.";
	if (d.actions.length === 0)
		return (c.sendMessage('§cThat build contained no usable actions.'), ImportMenu(c, e));
	const i = new ActionFormData();
	(i.title('§l§bImport Preview'),
		i.body(h),
		i.button(
			g ? '§aImport as a copy\n§8Keeps your existing bot' : '§aImport\n§8Add this bot',
			'textures/ui/confirm',
		));
	if (g) i.button('§cOverwrite my bot\n§8Replaces it permanently', 'textures/ui/trash');
	(i.button('§8Cancel', 'textures/ui/cancel'),
		i
			.show(c)
			.then((j) => {
				const k = g ? 2 : 1;
				if (j.canceled || j.selection === k) return ImportMenu(c, e);
				system.run(() => {
					const l = commitBuild(d, g && j.selection === 1 ? 'overwrite' : 'rename');
					(c.sendMessage(
						'§aImported bot §e' +
							l +
							'§a — §e' +
							d.actions.length +
							'§a actions, kit: §f' +
							(d.kit ?? 'None'),
					),
						d.warnings.forEach((m) => c.sendMessage('§e⚠ ' + m)));
					if (f?.isValid)
						try {
							(clearCarrier(f), f.remove());
						} catch (m) {}
					ShareMenu(c, e);
				});
			})
			.catch((j) => console.warn('Form error: ', j)));
}
function RemoveChamber() {
	const c = world.getDynamicProperty(CHAMBER_PROP);
	if (typeof c !== 'string') return null;
	let d;
	try {
		d = JSON.parse(c);
	} catch (i) {
		return (world.setDynamicProperty(CHAMBER_PROP, undefined), null);
	}
	const f = world.getDimension(d.dimension),
		g = d.base,
		h = findCarrierNear(f, interiorCenter(g), SEARCH_RADIUS);
	if (h?.isValid)
		try {
			h.remove();
		} catch (j) {}
	return (
		forEachInterior(g, (k) => setBlockSafe(f, k, 'minecraft:air')),
		forEachShell(g, (k) => setBlockSafe(f, k, 'minecraft:air')),
		setBlockSafe(f, chamberCorner(g), 'minecraft:air'),
		world.setDynamicProperty(CHAMBER_PROP, undefined),
		d
	);
}
function CleanupChamber(c, d) {
	const f = world.getDynamicProperty(CHAMBER_PROP);
	if (typeof f !== 'string')
		return (c.sendMessage("§7There's no export chamber to clean up."), ShareMenu(c, d));
	let g;
	try {
		g = JSON.parse(f);
	} catch (i) {
		g = null;
	}
	const h = new ActionFormData();
	(h.title('§l§6Clean Up Chamber'),
		h.body(
			g
				? '§8Remove the export chamber for §f' +
						g.botId +
						'§8 at §f' +
						showVec(chamberCorner(g.base)) +
						'§8?\n\n' +
						('§8The saved structure §f' +
							g.structureId +
							'§8 is kept, so you can still export the file later.')
				: '§8Remove the stored export chamber?',
		),
		h.button('§cRemove it', 'textures/ui/trash'),
		h.button('§8Keep it', 'textures/ui/cancel'),
		h
			.show(c)
			.then((j) => {
				if (j.canceled || j.selection === 1) return ShareMenu(c, d);
				system.run(() => {
					const k = RemoveChamber();
					(c.sendMessage(k ? '§aExport chamber removed.' : '§7Nothing to remove.'),
						ShareMenu(c, d));
				});
			})
			.catch((j) => console.warn('Form error: ', j)));
}
