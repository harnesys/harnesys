interface AgreementSection {
  title: string;
  paragraphs: readonly string[];
}

const AGREEMENT_SECTIONS: readonly AgreementSection[] = [
  {
    title: '1. Acceptance of Terms',
    paragraphs: [
      'This License Agreement ("Agreement") is a legal agreement between you and the Harnesys authors ("Authors") governing your use of the Harnesys application (the "Software"). By installing, copying, or using the Software, you accept this Agreement in full. If you do not agree to these terms, do not install or use the Software.',
      'The source code of the Software is made available under the Functional Source License 1.1, ALv2 Future License (the "Source License"). This Agreement governs your use of the distributed application and does not limit any right granted to you by the Source License. If this Agreement and the Source License conflict about the rights granted to you in the source code, the Source License governs.',
    ],
  },
  {
    title: '2. License Grant',
    paragraphs: [
      'Subject to this Agreement, the Authors grant you a non-exclusive license to install and use the Software, on machines you own or control, for any lawful purpose. Your rights to copy, modify, and redistribute the Software are governed by the Source License.',
    ],
  },
  {
    title: '3. Ownership',
    paragraphs: [
      'The Software is licensed, not sold. The Authors retain all rights, title, and interest in and to the Software, including all intellectual property rights.',
      'The Harnesys name and logo are trademarks of the Authors. This Agreement grants you no right to use them beyond stating that your work is based on Harnesys, and no right to ship a rebranded or confusingly similar version of the Software.',
    ],
  },
  {
    title: '4. Third-Party Services and Costs',
    paragraphs: [
      'The Software can connect to third-party services that you configure, such as model providers, search engines, and other APIs. Those services are governed by their own terms and privacy policies. The Authors are not a party to them and make no warranty about them.',
      'All fees, usage charges, overages, and spending incurred through such services are your sole responsibility. You are responsible for the credentials, budgets, and limits you configure. The Authors are not liable for any charge, loss, or damage resulting from autonomous runs, schedules, or agents that you enable.',
    ],
  },
  {
    title: '5. AI Output and Agent Actions',
    paragraphs: [
      'The Software runs AI models and automated agents that can take actions on your machine and on connected systems, including running commands and modifying files. Model output may be inaccurate, incomplete, or harmful, and agents may act in ways you did not intend.',
      'You are solely responsible for the tasks you delegate, the permissions you grant, and the actions agents perform. Do not rely on agent output for decisions with legal, financial, medical, or safety consequences without independent human review. You assume the full risk of running agents, including data loss, system damage, and unintended changes.',
    ],
  },
  {
    title: '6. Acceptable Use',
    paragraphs: [
      'You agree to use the Software only in compliance with applicable laws and with the terms of any third-party service you connect. You must not use the Software to infringe the rights of others, to gain unauthorized access to systems or data, or to create or distribute unlawful content.',
    ],
  },
  {
    title: '7. No Warranty',
    paragraphs: [
      'THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND NON-INFRINGEMENT. The entire risk as to the quality, performance, and results of the Software rests with you.',
    ],
  },
  {
    title: '8. Limitation of Liability',
    paragraphs: [
      'TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES, OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT, OR OTHERWISE, ARISING FROM, OUT OF, OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE, EVEN IF THE AUTHORS HAVE BEEN ADVISED OF THE POSSIBILITY OF SUCH DAMAGES.',
      'This includes, without limitation, data loss, lost profits, business interruption, system damage, third-party charges, or any harm caused by the Software, its output, or by actions performed by automated agents running inside it. You assume the full risk and cost of using the Software.',
      'Nothing in this Agreement excludes or limits any liability that cannot be excluded or limited under applicable law, including liability for death or personal injury caused by negligence, or for fraud.',
    ],
  },
  {
    title: '9. Indemnity',
    paragraphs: [
      'You agree to indemnify and hold harmless the Authors from any claim, loss, liability, or expense, including reasonable legal fees, arising from your use of the Software, the content you process, the tasks you delegate, or your breach of this Agreement or of the terms of any third-party service.',
    ],
  },
  {
    title: '10. Your Data and Privacy',
    paragraphs: [
      'Your settings and content are stored locally on your machine. You are solely responsible for creating backups and for the content you process with the Software.',
      'Any data you send to a third-party service, including when you sign in to an account or use a hosted feature, is handled under the terms of that service. The Authors do not sell your data.',
    ],
  },
  {
    title: '11. Third-Party Components',
    paragraphs: [
      'The Software includes third-party open-source components, each governed by its own license. Those licenses apply to those components, and nothing in this Agreement restricts the rights they grant you.',
    ],
  },
  {
    title: '12. Changes to This Agreement',
    paragraphs: [
      'The Authors may publish a revised version of this Agreement. If a new version is published, the Software will ask you to accept it again on the next launch before it can be used.',
    ],
  },
  {
    title: '13. Termination',
    paragraphs: [
      'This Agreement is effective until terminated. Your license terminates automatically if you decline this Agreement or breach its terms. Upon termination, you must stop using and uninstall the Software.',
    ],
  },
  {
    title: '14. Governing Law and Jurisdiction',
    paragraphs: [
      'This Agreement is governed by the laws of the country in which the Authors reside, without regard to its conflict-of-law rules. The courts of that country have exclusive jurisdiction over any dispute arising out of or relating to this Agreement or the Software, except where mandatory consumer-protection law in your country of residence gives you the right to bring proceedings locally.',
    ],
  },
  {
    title: '15. General',
    paragraphs: [
      'If any provision of this Agreement is held unenforceable, the remaining provisions stay in force. This Agreement is the entire agreement between you and the Authors regarding the Software.',
      'Questions and legal notices about this Agreement can be sent to mikestotik@gmail.com.',
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
