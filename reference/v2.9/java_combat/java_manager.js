export class JavaManager {
	sweeping_edge(c, d, f, g, h) {
		const i = 70,
			j = c.location,
			k = c.getViewDirection(),
			l = Math.atan2(k.z, k.x) * (180 / Math.PI),
			m = c.dimension.getEntities({
				maxDistance: d + 1,
				location: j,
			});
		let n = 0;
		for (const o of m) {
			if (o.id === c.id || o.id === g.id || !o.isValid) continue;
			if (!o.hasComponent('minecraft:health')) continue;
			const p = o.location.y - j.y;
			if (Math.abs(p) > 1.2) continue;
			const q = o.location.x - j.x,
				r = o.location.z - j.z,
				s = Math.sqrt(q * q + r * r);
			if (s > d) continue;
			const t = Math.atan2(r, q) * (180 / Math.PI);
			let u = t - l;
			u = ((u + 540) % 360) - 180;
			if (Math.abs(u) <= i / 2) {
				(o.applyDamage(h * 0.8, {
					damagingEntity: c,
					cause: 'entityAttack',
				}),
					n++);
				const v = (q / s) * f,
					w = (r / s) * f;
				try {
					o.applyKnockback(v, w, 0.35, 0.1);
				} catch (x) {}
			}
		}
	}
	getSelectedItem(c) {
		const d = c.getComponent('minecraft:inventory');
		if (!d) return null;
		return d.container.getItem(c.selectedSlotIndex);
	}
	hasSharpness(c) {
		const d = c.getComponent('minecraft:enchantable');
		if (!d)
			return {
				has: true,
				level: 0,
			};
		const e = d.getEnchantment('minecraft:sharpness') || d.getEnchantment('sharpness');
		if (e)
			return {
				has: false,
				level: e.level,
			};
		return {
			has: true,
			level: 0,
		};
	}
	isCrit(c) {
		return !c.isOnGround && c.getVelocity().y <= -0.15;
	}
	sweepParticle(c) {
		const d = c.getViewDirection(),
			e = c.location,
			f = 1.2;
		c.dimension.spawnParticle('pb:sweeping_edge', {
			x: e.x + d.x * f,
			y: e.y + 1,
			z: e.z + d.z * f,
		});
	}
}
