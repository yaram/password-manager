import scryptsy from 'scryptsy';
import nacl from 'tweetnacl';

declare var self: DedicatedWorkerGlobalScope;

self.addEventListener('message', e => {
    console.log(e.data);

    const result = scryptsy(
        Buffer.from(e.data.key),
            Buffer.from(e.data.salt),
        2048,
        8,
        1,
        nacl.secretbox.keyLength
    );

    self.postMessage(result.toString('base64'));
});