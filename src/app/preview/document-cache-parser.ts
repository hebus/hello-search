import { Injectable } from "@angular/core";

import { PreviewService } from "@sinequa/components/preview";
import { SearchService } from "@sinequa/components/search";
import { AppService } from "@sinequa/core/app-utils";
import { Subject } from "rxjs";

@Injectable({ providedIn: "root" })
export class DocumentCacheService {
  url: string;
  blobUrl = new Subject<string>();

  constructor(
    private appService: AppService,
    private previewService: PreviewService,
    private searchService: SearchService
  ) {
    window.addEventListener(
      "message",
      (event) => {
        console.log("event received:", event);

        if (event.data !== undefined && event.data.type === "page-navigation") {
          const url = this.url + event.data.url;
          this.fetchUrl(url, event.data.page);
        }
      },
      false
    );
  }

  /**
   * It fetches the url, extracts the images, changes the image attributes, and then creates a blob url
   * to be used in the iframe.
   * @param {string} id - string - the id of the document to preview
   */
  openPreview(id: string) {
    this.previewService
      .getPreviewData(id, this.searchService.query)
      .subscribe((data) => {
        const url =
          this.previewService.makeDownloadUrl(data.documentCachedContentUrl) ||
          "";

        // no transformations
        // this.blobUrl.next(url);
        // return;

        // simple fetch with no transformations
        // fetch(url).then(r => {
        //     r.blob().then(blob => {
        //         const blobUrl = URL.createObjectURL(blob);
        //         this.blobUrl.next(blobUrl);
        //     });
        // });
        // return;

        // fetch and DOM transformations
        this.fetchUrl(url);
      });
  }

  fetchUrl(url: string, page = 1) {
    fetch(url).then((r) => {
      const contentType = r.headers.get("content-Type") || "";
      return r.text().then((text) => {
        const html = this.extract(text, url, page);
        const blob = new Blob([html], { type: contentType });
        const blobUrl = URL.createObjectURL(blob);
        // this.iframe.nativeElement.src = blobUrl;
        this.blobUrl.next(blobUrl);
      });
    });
  }

  private extract(buffer, url, page?): string {
    const dom = new DOMParser();
    const doc = dom.parseFromString(buffer, "text/html");

    // add base href when not existing
    const links = doc.querySelectorAll("head > link");
    links.forEach((link) => link.setAttribute("defer", ""));

    const baseHrefCounter = doc.querySelectorAll("head > base");
    if (baseHrefCounter.length === 0) {
      const base = /(^.*)(file.*.htm.*$)/gm.exec(url);
      if (base !== null) {
        const baseHref = doc.createElement("base");
        baseHref.setAttribute("href", this.appService.origin + base[1]);

        // set current base href url to allow navigation
        this.url = base[1];
        console.log("base url:", this.url);

        // base href should be the first child
        doc.head.prepend(baseHref);

        console.log("override base href", baseHref);
      }
    }

    // remove scripts tag from head
    // is page navigator exists, replace script with this one

    const pageHeader = doc.getElementsByClassName("ph");
    if (pageHeader !== null) {
      // const pages = doc.getElementById('pages');
      // if (pages !== null) {
      const scripts = doc.querySelectorAll("head > script");
      scripts.forEach((script) => {
        if (script !== null && script.parentNode !== null)
          script.parentNode.removeChild(script);
      });
      doc.head.appendChild(this.customScript(doc, page));
    }

    /**
     * convert <object><embed/></object> to <iframe></iframe>
     */
    const nodes = doc.querySelectorAll("object");

    nodes.forEach((node) => {
      if (node.data) {
        // extract svg name from ['data'] attribute
        const regex = /^.*\/(.+svg$)/gm.exec(node.data);
        if (regex !== null) {
          const name = regex[1];
          const iframe = doc.createElement("iframe");
          iframe.src = `file_files/${name}`;
          iframe.setAttribute("loading", "lazy");

          iframe.className = node.className;
          iframe.style.cssText = node.style.cssText;

          // replace objet with <iframe>
          node.parentNode?.replaceChild(iframe, node);
        }
      }
    });
    console.log("<object> to <iframe> overrides:", nodes.length);

    /**
     * images manipulations
     */
    const images = doc.querySelectorAll("img");
    images.forEach((image) => {
      image.setAttribute("loading", "lazy");
    });
    console.log("images overrides:", images.length);

    /**
     * fix font glitches which can occurs with pdf converters
     */
    this.fixFontFamily(doc);

    // return the document
    // I can't serialize it, because I need to keep scripts undamaged
    return doc.documentElement.innerHTML;
  }

  private customScript(doc: Document, page = 1): HTMLScriptElement {
    /*
        var defPage=1;var firstPage=1;var lastPage=354;var _p;
        function CurUrl() {return _p.options[_p.selectedIndex].value;}
        function CurPage() {return _p.selectedIndex+firstPage;}
        function SetPage(pg) {_p.options.selectedIndex=pg-firstPage;_p.options[pg-firstPage].selected=true;}
        function FindPage(val) {var pg=defPage;var i,c;c=_p.options.length;for (i=0;i<c;i++){if (_p.options[i].label==val) {pg=i+firstPage;break;}}return pg;}
        function Go() {var url=CurUrl();self.location.href=url;}
        function GoF() {SetPage(firstPage);Go();}
        function GoL() {SetPage(lastPage);Go();}
        function GoP() {var pg=CurPage();if (pg<=firstPage) return;pg=pg-1;SetPage(pg);Go();}
        function GoN() {var pg=CurPage();if (pg>=lastPage) return;pg=pg+1;SetPage(pg);Go();}
        function Init()
        {
        _p=document.getElementById("pages");
        var url,r,pg=defPage,val;
        url=self.location.href;
        r=url.split("#");
        if ((r)&&(r.length>1)) {pg=FindPage(r[r.length-1]);}
        SetPage(pg);
        }
    */
    const scriptSource = `    
        var defPage=${page};var firstPage=1;var lastPage;var _p;
        function CurUrl() {return _p.options[_p.selectedIndex].value;}
        function CurPage() {return _p.selectedIndex+firstPage;}
        function SetPage(pg) {
            _p.options.selectedIndex=pg-firstPage;
            _p.options[pg-firstPage].selected=true;
        }
        function FindPage(val) {
            var pg=defPage;
            var i,c;
            c=_p.options.length;
            for (i=0;i<c;i++){
                if (_p.options[i].label==val) {
                    pg=i+firstPage;
                    break;
                }
            }
            return pg;
        }
        function Go() {
            var url=CurUrl();
            if(url.startsWith('#')) {
              // document.getElementById(url.slice(1)).scrollIntoView();
              const factor = Number(document.body.style.getPropertyValue('--factor')) || 1;
              const el = document.getElementById(url.slice(1)).parentElement;
              window.scrollTo({ top: el.offsetTop * factor });
            } else {
                window.parent.postMessage( { type: 'page-navigation', url, page: (_p.selectedIndex + 1) } , '*');
            }
        }
        function GoF() {SetPage(firstPage);Go();}
        function GoL() {SetPage(lastPage);Go();}
        function GoP() {var pg=CurPage();if (pg<=firstPage) return;pg=pg-1;SetPage(pg);Go();}
        function GoN() {var pg=CurPage();if (pg>=lastPage) return;pg=pg+1;SetPage(pg);Go();}
        function Init()
        {
            _p=document.getElementById("pages");
            if( _p !== null ) {
              lastPage = _p.length;
              var url,r,pg=defPage,val;
              url="#" + pg;
              r=url.split("#");
              if ((r)&&(r.length>1)) {
                  pg=FindPage(r[r.length-1]);
              }
              SetPage(pg);
              Go();
            }
        }
    `;

    const script = doc.createElement("script");
    script.innerHTML = scriptSource;
    return script;
  }

  private fixFontFamily(doc: Document) {
    const blocks = doc.querySelectorAll("div.t");
    blocks.forEach((block) => {
      const elements = block.querySelectorAll("span");

      if (elements.length > 1) {
        elements.forEach((element) => {
          element.childNodes.forEach((child) => {
            if (child.nodeType === 3 && child.textContent && child.textContent.trim().length > 0) {
              const span = doc.createElement("span");
              span.textContent = child.textContent;
              span.className = elements[0].className;
              element.insertBefore(span, child.nextSibling);
              child.remove();
            }
          });
        });

        const nodes = block.children;
        Array.from(nodes).forEach((node) => (node.className = ""));
      }
    });
  }
}
