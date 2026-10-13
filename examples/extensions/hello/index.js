/**
 * @caltemp
 * id: com.caltemp.examples.hello
 * name: Bonjour
 * version: 2.0.0
 * description: Le plus petit plugin possible : un seul fichier, une commande.
 * author: Caltemp
 * license: MIT
 */

export function activate(ctx) {
  ctx.commands.register({
    id: 'hello',
    label: 'Dire bonjour',
    run: () => ctx.ui.toast('Bonjour depuis un plugin Caltemp !', 'success'),
  });
}
