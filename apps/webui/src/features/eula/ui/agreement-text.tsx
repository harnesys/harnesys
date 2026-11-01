interface AgreementSection {
  title: string;
  paragraphs: readonly string[];
}

const AGREEMENT_SECTIONS: readonly AgreementSection[] = [
  {
    title: '1. Acceptance of Terms',
    paragraphs: [
      'This License Agreement ("Agreement") is a legal agreement between you and the Harnesys authors ("Authors") governing your use of the Harnesys application (the "Software"). By installing, copying, or using the Software, you accept this Agreement in full. If you do not agree to these terms, do not install or use the Software.',
    ],
  },
  {
    title: '2. License Grant',
    paragraphs: [
      'The Authors grant you a personal, non-exclusive, revocable, non-transferable license to install and use the Software on machines you own or control, for any lawful purpose.',
    ],
  },
  {
    title: '3. Ownership',
    paragraphs: [
      'The Software is licensed, not sold. The Authors retain all rights, title, and interest in and to the Software, including all intellectual property rights.',
    ],
  },
  {
    title: '4. No Warranty',
    paragraphs: [
      'THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND NON-INFRINGEMENT. The entire risk as to the quality, performance, and results of the Software rests with you.',
    ],
  },
  {
    title: '5. Limitation of Liability',
    paragraphs: [
      'IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES, OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT, OR OTHERWISE, ARISING FROM, OUT OF, OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.',
      'This includes, without limitation, data loss, lost profits, business interruption, system damage, or any harm caused by the Software, its output, or by actions performed by automated agents running inside it. You assume the full risk and cost of using the Software.',
    ],
  },
  {
    title: '6. Your Data',
    paragraphs: [
      'The Software stores your settings and content locally on your machine. You are solely responsible for creating backups and for the content you process with the Software.',
    ],
  },
  {
    title: '7. Changes to This Agreement',
    paragraphs: [
      'The Authors may publish a revised version of this Agreement. If a new version is published, the Software will ask you to accept it again on the next launch before it can be used.',
    ],
  },
  {
    title: '8. Termination',
    paragraphs: [
      'This Agreement is effective until terminated. Your license terminates automatically if you decline this Agreement or breach its terms. Upon termination, you must stop using and uninstall the Software.',
    ],
  },
  {
    title: '9. General',
    paragraphs: [
      'If any provision of this Agreement is held unenforceable, the remaining provisions stay in force. Questions about this Agreement can be sent to the Authors through the project repository.',
    ],
  },
];

export function AgreementText({ version }: { version: string }) {
  return (
    <div className="flex min-h-0 flex-col gap-4 text-muted-foreground text-sm leading-relaxed">
      {AGREEMENT_SECTIONS.map((section) => (
        <section key={section.title} className="flex flex-col gap-1.5">
          <h3 className="font-medium text-foreground">{section.title}</h3>
          {section.paragraphs.map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))}
        </section>
      ))}
      <p className="text-muted-foreground/70 text-xs">Version {version}</p>
    </div>
  );
}
