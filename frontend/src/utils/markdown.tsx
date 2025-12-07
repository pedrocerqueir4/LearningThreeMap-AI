import type { Components } from 'react-markdown'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'

/**
 * Shared ReactMarkdown components configuration for consistent rendering
 * across the application. Used in both node view and chat view.
 */
export const markdownComponents: Components = {
    p: ({ children }: any) => <p style={{ margin: '0.25rem 0' }}>{children}</p>,
    strong: ({ children }: any) => <strong style={{ fontWeight: 700 }}>{children}</strong>,
    em: ({ children }: any) => <em style={{ fontStyle: 'italic' }}>{children}</em>,
    code: ({ children }: any) => (
        <code
            style={{
                backgroundColor: 'rgba(0, 0, 0, 0.1)',
                padding: '0.1rem 0.3rem',
                borderRadius: '0.2rem',
                fontFamily: 'monospace',
            }}
        >
            {children}
        </code>
    ),
    ul: ({ children }: any) => <ul style={{ margin: '0.25rem 0', paddingLeft: '1.25rem' }}>{children}</ul>,
    ol: ({ children }: any) => <ol style={{ margin: '0.25rem 0', paddingLeft: '1.25rem' }}>{children}</ol>,
    li: ({ children }: any) => <li style={{ margin: '0.1rem 0' }}>{children}</li>,
}

/**
 * Remark and Rehype plugins for markdown processing
 * - remarkMath: Parses LaTeX math expressions (inline $...$ and block $$...$$)
 * - rehypeKatex: Renders LaTeX expressions using KaTeX
 */
export const remarkPlugins = [remarkMath]
export const rehypePlugins = [rehypeKatex]

