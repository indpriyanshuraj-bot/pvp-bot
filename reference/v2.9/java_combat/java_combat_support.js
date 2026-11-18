import { world, system } from '@minecraft/server';
import { getWorldProp } from '../dynamic_store.js';
const BOT_TAG = 'PvPbot';
world.afterEvents.entityHurt.subscribe((c) => {
	if (getWorldProp('javaCombat')) return;
	const d = c.hurtEntity,
		e = c.damageSource.damagingEntity;
	if (!d?.isValid || !e?.isValid) return;
	const f = d.hasTag(BOT_TAG);
	if (!f) return;
	if (e.hasTag(BOT_TAG)) return;
	if (e.typeId !== 'minecraft:player') return;
	system.run(() => {
		d.isValid && e.isValid && applyCustomJavaCombat(d, e);
	});
});
function applyCustomJavaCombat(c, d, f, g) {
	const h = c.location.x - d.location.x,
		i = c.location.z - d.location.z,
		j = Math.sqrt(h * h + i * i) || 1,
		k = h / j,
		l = i / j,
		m = d.isSprinting;
	f = 2;
	const n = m ? 0.65 : 0.4;
	g = 0.35;
	try {
		c.applyKnockback(k, l, n, g);
	} catch (o) {}
}
