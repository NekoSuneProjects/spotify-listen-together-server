import { NextPage } from "next";
import Image from 'next/image'
import config from "../../config";
import styles from '../styles/Index.module.css'
import stylesInst from '../styles/Instructions.module.css'
import spotStyles from '../styles/Spot.module.css'

const Instructions: NextPage = () => {
  const repoURL = `https://raw.githubusercontent.com/NekoSuneProjects/spotify-listen-together/${config.clientRecommendedVersion}`
  const listenTogetherURL = `${repoURL}/compiled/listenTogether.js`
  const windowsInstallCMD = `iwr -useb https://raw.githubusercontent.com/spicetify/cli/main/install.ps1 | iex`
  const linuxInstallCMD = `curl -fsSL https://raw.githubusercontent.com/spicetify/cli/main/install.sh | sh`
  const macInstallCMD = `curl -fsSL https://raw.githubusercontent.com/spicetify/cli/main/install.sh | sh`

  return (
    <div className="main">
      <div className={styles.contentContainer}>
        <br />
        <div className={styles.header}>Install Spotify Listen Together</div>
        <br /><br />
        <div className={styles.header+" "+styles.left}>Automatic Windows install for Spotify Marketplace</div>
        <br />
        <div className={styles.text+" "+styles.left}>
          1. Press WIN + R<br/>
          2. Type &quot;Powershell&quot; and press ENTER<br/>
          3. Paste:
        </div>
        <br />
        <div className={spotStyles.box+" "+styles.code} onClick={(e) => {
          navigator.clipboard.writeText(windowsInstallCMD)
          
          if (window.getSelection) {
            const selection = window.getSelection();
            const range = document.createRange();
            range.selectNodeContents(e.currentTarget);
            selection?.removeAllRanges();
            selection?.addRange(range);
          }
        }}>
          {windowsInstallCMD}
        </div>
        <br /><br />
        <div className={styles.header+" "+styles.left}>Automatic Linux install for Spotify Marketplace</div>
        <br />
        <div className={styles.text+" "+styles.left}>
          1. Open Terminal<br/>
          2. Paste:
        </div>
        <br />
        <div className={spotStyles.box+" "+styles.code} onClick={(e) => {
          navigator.clipboard.writeText(linuxInstallCMD)
          
          if (window.getSelection) {
            const selection = window.getSelection();
            const range = document.createRange();
            range.selectNodeContents(e.currentTarget);
            selection?.removeAllRanges();
            selection?.addRange(range);
          }
        }}>
          {linuxInstallCMD}
        </div>
        <br /><br />
        <div className={styles.header+" "+styles.left}>Automatic macOS install for Spotify Marketplace</div>
        <br />
        <div className={styles.text+" "+styles.left}>
          1. Open Terminal<br/>
          2. Paste:
        </div>
        <br />
        <div className={spotStyles.box+" "+styles.code} onClick={(e) => {
          navigator.clipboard.writeText(macInstallCMD)
          
          if (window.getSelection) {
            const selection = window.getSelection();
            const range = document.createRange();
            range.selectNodeContents(e.currentTarget);
            selection?.removeAllRanges();
            selection?.addRange(range);
          }
        }}>
          {macInstallCMD}
        </div>
        <br /><br />
        <br /><br />
        <div className={styles.header+" "+styles.left}>OR: Manual install</div>
        <br />
        <div className={styles.text+" "+styles.left}>
          1. Download and install <a href="https://spicetify.app/docs/getting-started">Spicetify</a>.<br/><br/>
          2. Download <a href={listenTogetherURL}>listenTogether.js</a>.<br/><br/>
          3. Paste &quot;listenTogether.js&quot; into the Spicetify Extensions folder:<br/>
          Windows: &quot;%appdata%\spicetify\Extensions\&quot;<br/>
          Linux / macOS: &quot;~/.config/spicetify/Extensions/&quot;<br/><br/>
          4. Run &quot;spicetify config extensions listenTogether.js&quot; and &quot;spicetify backup and spicetify apply&quot;.<br/><br/>
        </div>
        <br/><br/>
        <br/><br/>
        <div className={styles.header+" "+styles.left}>After installation</div>
        <br/>
        <div className={styles.text+" "+styles.left+" "+styles.instructionsContainer}>
          <div>
            {"1. Open Listen Together's menu by pressing the button on the top left."}<br/>
            <img src="images/Instruction1.png"></img><br/><br/>
          </div>
          <div>
            {"2. Select \"Join a server\""}<br/>
              <img src="images/Instruction2.png"></img><br/><br/>
          </div>
          <div>
            {"3. Enter the URL and your name"}<br/>
            <div className={styles.instruction2Container}>
              <img src="/images/Instruction3.png"></img>
              <span className={styles.urlValue}>
                {typeof location !== 'undefined' ? location.protocol + '//' + location.host : ""}
              </span>
            </div>
          </div>
        </div>
        <br/><br/><br/><br/><br/><br/><br/><br/>
      </div>
    </div>
  )
}

export default Instructions
