/** @jsxImportSource ai-jsx/react */

import * as AI from '../core.js';
import { ChatCompletion, SystemMessage } from '../../core/completion.js';
import React from 'react';
import { collectComponents } from '../completion.js';
import { compile } from '@mdx-js/mdx';
import _ from 'lodash';

/**
 * A completion component that emits [MDX](https://mdxjs.com/).
 *
 * By default, the result streamed out of this component will sometimes be unparsable, as the model emits a partial value.
 * (For instance, if the model is emitting the string `foo <Bar />`, and
 * it streams out `foo <Ba`, that's not parsable.)
 *
 * To ensure that the result is always parsable, pass the prop `alwaysParsable`. This will buffer up intermediate streaming results until the result accumulated so far is parsable.
 *
 * You'll get better results with this if you use GPT-4.
 *
 * Use `usageExamples` to teach the model how to use your components.
 *
 * @see https://docs.ai-jsx.com/guides/mdx
 * @see https://github.com/fixie-ai/ai-jsx/blob/main/packages/examples/src/mdx.tsx
 */
export async function* MdxChatCompletion(
  { children, usageExamples, hydrate }: { children: AI.Node; usageExamples: React.ReactNode; hydrate?: boolean },
  { render, logger }: AI.ComponentContext
) {
  const components = collectComponents(usageExamples);
  /* prettier-ignore */
  // const completion = <ChatCompletion>
  //   <SystemMessage>
  //     You are an assistant who can use React components to work with the user. By default, you use markdown. However, if it's useful, you can also mix in the following React components: {Object.keys(components).join(', ')}.
  //     All your responses
  //     should be in MDX, which is Markdown For the Component Era. Here are instructions for how to use MDX:
  //     === Begin instructions
  //     {/* Snipped from https://github.com/mdx-js/mdx/blob/main/docs/docs/what-is-mdx.server.mdx. */}
  //     MDX allows you to use JSX in your markdown content.
  //     You can import components, such as interactive charts or alerts, and embed them
  //     within your content.
  //     This makes writing long-form content with components a blast.

  //     More practically MDX can be explained as a format that combines markdown with
  //     JSX and looks as follows:

  //     === Begin example
  //     {`
  //       Here is some markdown text
  //       <MyComponent id="123" />

  //       # Here is more markdown text

  //       <Component
  //         open
  //         x={1}
  //         label={'this is a string, *not* markdown!'}
  //         icon={<Icon />}
  //       />

  //       * Markdown list item 1
  //       * Markdown list item 2
  //       * Markdown list item 3
  //     `}
  //     === end example
  //     === end instructions

  //     Do not include a starting ```mdx and closing ``` line. Just respond with the MDX itself.

  //     Do not include extra whitespace that is not needed for the markdown interpretation. For instance, if your component has a prop that's a JSON object, put it all on one line:

  //     {'<Component prop={[[{"key": "value"}, {"long": "field"}]]} />'}

  //     This doc tells you the differences between MDX and markdown.

  //     {/* Adapted from https://github.com/micromark/mdx-state-machine#72-deviations-from-markdown */}
  //     === Start doc
  //     ### 7.2 Deviations from Markdown

  //     MDX adds constructs to Markdown but also prohibits certain normal Markdown
  //     constructs.

  //     #### 7.2.2 Indented code

  //     Indentation to create code blocks is not supported.
  //     Instead, use fenced code blocks.

  //     The reason for this change is so that elements can be indented.

  //     {/* Commenting out the negative examples because they seem to confuse the LLM. */}
  //     {/*
  //     Incorrect:

  //     ```markdown
  //         console.log(1)
  //     ``` */}

  //     Correct:

  //       ```js
  //       console.log(1)
  //       ```

  //     #### 7.2.3 Autolinks

  //     Autolinks are not supported.
  //     Instead, use links or references.

  //     The reason for this change is because whether something is an element (whether
  //     HTML or JSX) or an autolink is ambiguous {'(Markdown normally treats `<svg:rect>`, `<xml:lang/>`, or `<svg:circle{...props}>` as links).'}

  //     {/* Incorrect:

  //     ```markdown
  //     See <https://example.com> for more information
  //     ``` */}

  //     Correct:

  //       See [example.com](https://example.com) for more information.

  //     #### 7.2.4 Errors

  //     Whereas all Markdown is valid, incorrect MDX will crash.
  //     === end doc

  //     Here are the components you have available, and how to use them:

  //     === Begin components
  //     <AI.React>{usageExamples}</AI.React>
  //     === end components
  //   </SystemMessage>
  //   {children}
  // </ChatCompletion>;

  const completion = <>{`pre text
<Card>
  * **Foo**: bar
  <Badge color='red'>Content</Badge>
  <Toggle title='my title' subtitle='my subtitle' />
</Card>
post text`}</>

  if (!hydrate) {
    return completion;
  }

  async function hydrateMDX(mdx: string, components: ReturnType<typeof collectComponents>) {
    let ast: Node | undefined;

    function rehypePlugin() {
      return (_ast: Node) => {
        ast = _ast;
      };
    }
    await compile(mdx, {
      rehypePlugins: [rehypePlugin],
    });

    const hydrated = convertAstToComponent(ast!, components);
    logger.warn({ hydrated, ast }, 'Hydrating MDX');

    return (
      <AI.React>
        {convertAstToComponent(ast!, components)}
        {/* <div>{mdx}</div> */}
        {/* {React.createElement('div', { children: mdx })} */}
      </AI.React>
    );
  }

  function convertAstToComponent(ast: Node, components: ReturnType<typeof collectComponents>): React.ReactNode {
    function convertAstToComponentRec(ast: Node): React.ReactNode {
      const { type, tagName, children = [], name, attributes = [] } = ast;

      switch (type) {
        case 'root': {
          return <div>{_.compact(children.map(convertAstToComponentRec))}</div>;
        }
        case 'element': {
          return <div>element {_.compact(children.map(convertAstToComponentRec))}</div>;
          // return React.createElement(tagName!, {}, ..._.compact(children.map(convertAstToComponentRec)));
        }
        case 'mdxJsxTextElement':
        case 'mdxJsxFlowElement': {
          const componentName = name!;
          // @ts-expect-error
          const props = attributes.reduce<Jsonifiable>((acc: any, attr: any) => {
            if (attr.value?.type) {
              // E.g. <A b={null} />
              throw new Error(
                `Unimplemented code path: handling a React component with a non-trivial prop ${JSON.stringify(
                  attr.value,
                  null,
                  2
                )}`
              );
            }
            acc[attr.name] = attr.value === null ? true : attr.value;
            return acc;
          }, {});

          const Component = components[componentName];
          if (!Component) {
            logger.warn(
              { component: componentName },
              `Ignoring component "${componentName}" that wasn't present in the example. ` +
                'You may need to adjust the prompt or include an example of this component.'
            );
            return null;
          }

          // return <div>{JSON.stringify(ast)}</div>
          // return React.createElement(Component, props, _.compact(children.map(convertAstToComponentRec)));
          // console.log({Component}, 'rendering component');
          return <Component {...props}>{_.compact(children.map(convertAstToComponentRec))}</Component>;
        }
        case 'text': {
          if (ast.value === '\n') {
            return <br />;
          }
          return <span>{[ast.value]}</span>;
        }
        // We handle the imports separately.
        case 'mdxjsEsm': {
          return null;
        }
        default: {
          throw new Error(`Unhandled MDX AST type: ${JSON.stringify(ast, null, 2)}`);
        }
      }
    }
    return convertAstToComponentRec(ast);
  }

  const renderedCompletion = render(completion);

  for await (const frame of renderedCompletion) {
    try {
      yield hydrateMDX(frame, components);
      logger.trace({ frame }, 'Yielding parsable frame');
    } catch {
      // Make sure we only yield parsable frames.
      logger.trace({ frame }, 'Not yielding unparsable frame');
    }
  }
  // TODO: do not assume the last frame is parsable.
  return hydrateMDX(await renderedCompletion, components);
}

interface Node {
  type: string;
  tagName?: string;
  children?: Node[];
  name?: string;
  value?: string;
  attributes?: { type: string; name: string; value: string }[];
}
