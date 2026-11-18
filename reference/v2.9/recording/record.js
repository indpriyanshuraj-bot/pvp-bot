import { ActionFormData, ModalFormData } from '@minecraft/server-ui';
import { RecordingManager, Storage } from './recording_manager';
import { PlayBackManager } from './playback_manager';
const playbackSystem = new PlayBackManager(),
	recordingSystem = new RecordingManager();
(recordingSystem.registerEvents(), playbackSystem.registerEvents());
function PlaybackMenu(c) {
	const d = recordingSystem.getRecordings(c),
		e = new ActionFormData();
	e.title('Recordings Playback');
	if (d.length === 0) (e.body('§cNo recordings found!'), e.button('Close'));
	else {
		e.body('Select a recording to view or manage\n§cWarning this feature is WIP.');
		for (const f of d) {
			const g = Storage.load(c, f);
			let i = '0s';
			if (g && g.frames) {
				const j = g.interval ?? 1,
					k = Math.floor((g.frames.length * j) / 20),
					l = Math.floor(k / 3600),
					n = Math.floor((k % 3600) / 60),
					o = k % 60;
				if (l > 0) i = l + 'h ' + n + 'm ' + o + 's';
				else n > 0 ? (i = n + 'm ' + o + 's') : (i = o + 's');
			}
			e.button(f.split('_')[1] + '\nLength: ' + i);
		}
	}
	e.show(c).then((p) => {
		if (p.canceled || d.length === 0) return;
		RecordingSettings(c, d[p.selection]);
	});
}
export { PlaybackMenu };
function RecordingSettings(c, d, e) {
	const f = new ModalFormData();
	e = 3;
	const g = d.split('_')[1];
	(f.title('Recording: ' + g),
		f.textField('Playback Speed', 'e.g., 1, 2, 0.5', {
			defaultValue: '1',
		}),
		f.toggle('§cDelete this recording?', {
			defaultValueIndex: true,
		}),
		f.show(c).then((h) => {
			if (h.canceled) return PlaybackMenu(c);
			let i = parseFloat(h.formValues[0]);
			(isNaN(i) || i <= 0) && (i = 1);
			const j = h.formValues[1];
			j
				? (c.setDynamicProperty(d, undefined),
					c.sendMessage('§aSuccessfully deleted recording: ' + g),
					PlaybackMenu(c))
				: playbackSystem.startPlayBack(c, d, i);
		}));
}
